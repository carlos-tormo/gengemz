import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Check, Heart, Link as LinkIcon, ListPlus, Loader2, Play,
  RefreshCw, Star, Sparkles, Trophy, Users,
} from 'lucide-react';
import { PLACEHOLDER_COVERS } from '../config/constants';
import { boardGameFromEvent, timeAgo } from '../services/feedService';

/**
 * Activity feed at /feed (S7), fan-out-on-read.
 *
 * Every author is a separate query (decision 11 — no collection group query
 * can be authorised), merged in `feedService` and grouped here into cards.
 * Names and avatars come from `public_profiles`, read once per author by
 * `useFeed`, never from the event, so a rename never leaves a stale card.
 */

const ICONS = {
  game_added: <ListPlus size={14} />,
  game_started: <Play size={14} />,
  game_completed: <Trophy size={14} />,
  game_rated: <Star size={14} />,
  game_favorited: <Heart size={14} />,
  playlist_created: <Sparkles size={14} />,
};

/* One sentence per card. `count` is the size of a grouped burst. */
const sentence = (card) => {
  const [first] = card.events;
  const count = card.events.length;
  const many = count > 1;
  const list = first?.meta?.columnTitle;

  switch (card.type) {
    case 'game_added':
      return many
        ? `added ${count} games${list ? ` to ${list}` : ''}`
        : `added a game${list ? ` to ${list}` : ''}`;
    case 'game_started':
      return many ? `started ${count} games` : 'started playing';
    case 'game_completed':
      return many ? `finished ${count} games` : 'finished';
    case 'game_rated':
      return many ? `rated ${count} games` : `rated ${first?.meta?.rating ?? '?'}/10`;
    case 'game_favorited':
      return many ? `favourited ${count} games` : 'favourited';
    case 'playlist_created':
      return many ? `published ${count} playlists` : 'published a playlist';
    default:
      return 'did something';
  }
};

const Avatar = ({ profile, uid, onClick }) => (
  <button onClick={onClick} className="shrink-0" aria-label="Open profile">
    {profile?.photoURL ? (
      <img src={profile.photoURL} alt="" className="w-9 h-9 rounded-full object-cover border border-[var(--border)]" />
    ) : (
      <div className="w-9 h-9 rounded-full bg-[var(--panel-muted)] text-[var(--text)] flex items-center justify-center uppercase text-sm font-bold border border-[var(--border)]">
        {(profile?.displayName || uid || 'P')[0]}
      </div>
    )}
  </button>
);

const Cover = ({ game, onClick }) => (
  <button
    onClick={onClick}
    title={game?.title}
    className="w-12 h-16 rounded-md bg-cover bg-center border border-[var(--border)] shrink-0 hover:border-[var(--accent)] transition-colors"
    style={{
      background: game?.cover
        ? `url(${game.cover}) center/cover`
        : PLACEHOLDER_COVERS[0],
    }}
  />
);

const Empty = ({ children }) => (
  <div className="text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl p-6 text-center bg-[var(--panel)]/30">
    {children}
  </div>
);

const secondaryButton = 'text-xs px-2.5 py-1 rounded-lg bg-[var(--panel-muted)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50';

const FeedCard = ({ card, profile, onOpenProfile, onOpenBoard, onAddGame, isOnBoard, canAdd }) => {
  const [added, setAdded] = useState({});
  const hasGame = card.events.some((event) => event.game);
  const name = profile?.displayName || 'Player';
  const isPlaylist = card.type === 'playlist_created';

  // Only marks the card when the add actually happened: the handler refuses an
  // anonymous session and an event whose game summary is gone.
  const add = (event) => {
    if (onAddGame(event)) setAdded((prev) => ({ ...prev, [event.id]: true }));
  };

  return (
    <div className="flex gap-3 bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
      <Avatar profile={profile} uid={card.uid} onClick={onOpenProfile} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <button onClick={onOpenProfile} className="text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)] truncate max-w-[12rem]">
            {name}
          </button>
          <span className="text-sm text-[var(--text-muted)] flex items-center gap-1">
            <span className="text-[var(--accent)]">{ICONS[card.type]}</span>
            {sentence(card)}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] ml-auto tabular-nums">{timeAgo(card.createdAt)}</span>
        </div>

        {isPlaylist ? (
          <div className="mt-1.5 text-sm text-[var(--text)]">
            {card.events.map((event) => event.playlist?.name).filter(Boolean).join(', ')}
          </div>
        ) : (
          <div className="mt-2 flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            {card.events.map((event) => (
              event.game ? (
                <div key={event.id} className="flex flex-col items-center gap-1 w-16 shrink-0">
                  <Cover game={event.game} onClick={onOpenBoard} />
                  <span className="text-[10px] text-[var(--text-muted)] text-center leading-tight line-clamp-2">
                    {event.game.title}
                  </span>
                  {/* Until the board has loaded, "is it already on my board?"
                      has no answer — offering the button then would add a
                      second copy of a game you already own, into a column that
                      may not exist. */}
                  {canAdd && (
                    added[event.id] || isOnBoard(event) ? (
                      <span className="text-[10px] text-green-500 flex items-center gap-0.5"><Check size={10} /> On board</span>
                    ) : (
                      <button
                        onClick={() => add(event)}
                        className="text-[10px] text-[var(--accent)] hover:underline"
                      >
                        + Backlog
                      </button>
                    )
                  )}
                </div>
              ) : null
            ))}
            {!hasGame && <span className="text-xs text-[var(--text-muted)]">Game no longer available</span>}
          </div>
        )}
      </div>
    </div>
  );
};

const FeedPage = ({
  user,
  isAuthLoading = false,
  areRelationshipsLoading = false,
  feed,
  includeOwn,
  onToggleIncludeOwn,
  onAddGame,
  isGameOnBoard,
  isBoardReady = false,
  onCopyProfileLink,
}) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const {
    cards, profiles, isLoading, isLoadingMore, hasMore, error, hasNewActivity, loadMore, refresh, authorCount,
  } = feed;

  if (isAuthLoading || (user && areRelationshipsLoading)) {
    return (
      <div className="max-w-2xl mx-auto h-48 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!user || user.isAnonymous) {
    return (
      <div className="max-w-2xl mx-auto pt-10">
        <Empty>Sign in with an account to follow other players and see their activity here.</Empty>
      </div>
    );
  }

  const copyLink = async () => {
    await onCopyProfileLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const emptyState = (
    <Empty>
      <p className="mb-3">
        {authorCount
          ? 'Nothing here yet — the people you follow have not done anything worth reporting.'
          : 'Your feed is empty because you are not following anyone yet.'}
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button onClick={() => navigate('/connections')} className={secondaryButton}>
          <span className="flex items-center gap-1"><Users size={12} /> Find players</span>
        </button>
        <button onClick={copyLink} className={secondaryButton}>
          <span className="flex items-center gap-1">
            {copied ? <Check size={12} className="text-green-500" /> : <LinkIcon size={12} />}
            {copied ? 'Link copied' : 'Share my profile'}
          </span>
        </button>
      </div>
    </Empty>
  );

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6"
      >
        <ArrowLeft size={20} />
        <span className="font-semibold">Back to Board</span>
      </button>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold text-[var(--text)]">Feed</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={includeOwn}
              onChange={(event) => onToggleIncludeOwn(event.target.checked)}
              className="accent-[var(--accent)]"
            />
            Include my activity
          </label>
          <button onClick={refresh} className={secondaryButton} title="Refresh">
            <span className="flex items-center gap-1"><RefreshCw size={12} /> Refresh</span>
          </button>
        </div>
      </div>

      {hasNewActivity && (
        <button
          onClick={refresh}
          className="w-full mb-3 text-xs font-semibold py-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/40 hover:bg-[var(--accent)]/20"
        >
          New activity — tap to refresh
        </button>
      )}

      {error && (
        <div className="mb-3 text-xs text-red-500 border border-red-300 dark:border-red-800 rounded-lg p-3">
          Could not load the feed. {error.message || ''}
        </div>
      )}

      {isLoading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : cards.length === 0 ? (
        emptyState
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <FeedCard
              key={card.id}
              card={card}
              profile={profiles[card.uid]}
              onOpenProfile={() => navigate(`/u/${card.uid}`)}
              onOpenBoard={() => navigate(`/u/${card.uid}?tab=board`)}
              onAddGame={onAddGame}
              canAdd={isBoardReady}
              isOnBoard={(event) => isGameOnBoard(boardGameFromEvent(event))}
            />
          ))}
        </div>
      )}

      {!isLoading && hasMore && (
        <div className="flex justify-center mt-4">
          <button onClick={loadMore} disabled={isLoadingMore} className={secondaryButton}>
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedPage;
