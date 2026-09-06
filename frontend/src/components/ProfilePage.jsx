import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams, Navigate } from 'react-router';
import {
  ArrowLeft, BarChart3, Check, Heart, Link as LinkIcon, LayoutGrid, Loader2, Lock, Shield, Star, Trophy, Users,
} from 'lucide-react';
import IconRenderer from './IconRenderer';
import { PLACEHOLDER_COVERS } from '../config/constants';
import { computeUserStats, gamesById, toBoardView, toMillis } from '../services/boardService';

/**
 * Public profile page at /u/:uid.
 *
 * Header + follow actions came from S1. S4 adds the progression view: a tab per
 * column of the owner's board plus a Stats tab, all derived from one games
 * listener (<=500 documents), with `?tab=` carrying the selection so a tab is
 * linkable and survives back/forward.
 */

const formatDate = (value) => {
  const millis = toMillis(value);
  return millis == null ? null : new Date(millis).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const coverStyle = (game) => ({
  background: game.cover
    ? `url(${game.cover}) center/cover`
    : PLACEHOLDER_COVERS[(game.coverIndex || 0) % PLACEHOLDER_COVERS.length],
});

/** Turns a failed board/games read into the message the S1 locked state shows. */
const lockedMessage = (err, privacy) => {
  if (err?.code === 'permission-denied') {
    return privacy === 'invite_only'
      ? 'This board is invite only. Send a follow request to see it once accepted.'
      : 'You do not have access to this board.';
  }
  console.error('Failed to load profile board', err);
  return 'Could not load this board.';
};

const Empty = ({ children }) => (
  <div className="text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl p-6 text-center bg-[var(--panel)]/30">
    {children}
  </div>
);

const Locked = ({ message }) => (
  <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl p-4 bg-[var(--panel)]/30">
    <Lock size={18} className="shrink-0 opacity-60" />
    <span>{message}</span>
  </div>
);

/** Read-only card: no menu, no drag, nothing that would write to someone else's board. */
const ProfileGameCard = ({ game, footer }) => (
  <div className="flex gap-3 items-center bg-[var(--panel)] border border-[var(--border)] rounded-lg p-2.5 shadow-sm">
    <div className="w-11 h-14 rounded-md shrink-0 bg-cover bg-center border border-[var(--border)]" style={coverStyle(game)} />
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-2">
        <h4 className="text-sm font-semibold text-[var(--text)] leading-tight line-clamp-2 flex-1">{game.title}</h4>
        {game.isFavorite && <Heart size={13} className="text-red-500 fill-current shrink-0 mt-0.5" />}
        {game.rating > 0 && (
          <span className="shrink-0 flex items-center gap-0.5 text-[11px] font-bold text-[var(--text)] bg-[var(--panel-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">
            <Star size={10} className="fill-current text-yellow-500" />{game.rating}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
        {[game.platform, game.year].filter(Boolean).join(' · ') || 'No platform'}
      </div>
      {footer && <div className="text-[11px] text-[var(--accent)] mt-0.5">{footer}</div>}
    </div>
  </div>
);

const GameGrid = ({ games, footerFor }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {games.map((game) => (
      <ProfileGameCard key={game.id} game={game} footer={footerFor ? footerFor(game) : null} />
    ))}
  </div>
);

const StatTile = ({ label, value, hint }) => (
  <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
    <div className="text-2xl font-bold text-[var(--text)]">{value}</div>
    <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] mt-1">{label}</div>
    {hint && <div className="text-[11px] text-[var(--text-muted)] mt-1">{hint}</div>}
  </div>
);

const Bar = ({ label, count, share, muted }) => (
  <div className="flex items-center gap-3">
    <div className={`w-28 shrink-0 text-xs truncate ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>{label}</div>
    <div className="flex-1 h-2 rounded-full bg-[var(--panel-muted)] overflow-hidden">
      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
    <div className="w-8 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{count}</div>
  </div>
);

const StatsTab = ({ stats }) => {
  if (!stats || stats.total === 0) return <Empty>This player has not added any games yet.</Empty>;
  const maxColumn = Math.max(1, ...stats.perColumn.map((column) => column.count));
  const maxRating = Math.max(1, ...stats.ratingHistogram.map((bucket) => bucket.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Games" value={stats.total} />
        <StatTile
          label="Completed"
          value={stats.completed}
          hint={stats.completed > 0 && stats.recentlyCompleted.length === 0 ? 'No dates recorded' : undefined}
        />
        <StatTile label="Favourites" value={stats.favorites} />
        <StatTile
          label="Average score"
          value={stats.averageRating == null ? '—' : stats.averageRating.toFixed(1)}
          hint={stats.ratedCount ? `${stats.ratedCount} rated` : 'Nothing rated yet'}
        />
      </div>

      <section className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-2.5">
        <div className="text-xs uppercase text-[var(--text-muted)]">Games per list</div>
        {stats.perColumn.map((column) => (
          <Bar key={column.id} label={column.title} count={column.count} share={column.count / maxColumn} />
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-2.5">
          <div className="text-xs uppercase text-[var(--text-muted)]">Platforms</div>
          {stats.platforms.map((platform) => (
            <Bar key={platform.name} label={platform.name} count={platform.count} share={platform.share} muted={platform.name === 'Unknown'} />
          ))}
        </section>

        <section className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--text-muted)] mb-3">Scores given</div>
          {stats.ratedCount === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">No scores yet.</div>
          ) : (
            <div className="flex items-end gap-1.5 h-28">
              {stats.ratingHistogram.map((bucket) => (
                <div key={bucket.rating} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${bucket.count} rated ${bucket.rating}`}>
                  <div
                    className={`w-full rounded-t ${bucket.count ? 'bg-[var(--accent)]' : 'bg-[var(--panel-muted)]'}`}
                    style={{ height: `${Math.max(bucket.count ? 6 : 2, (bucket.count / maxRating) * 100)}%` }}
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">{bucket.rating}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <div className="text-xs uppercase text-[var(--text-muted)] mb-2 flex items-center gap-1.5"><Star size={12} /> Top rated</div>
          {stats.topRated.length === 0
            ? <Empty>Nothing rated yet.</Empty>
            : <div className="space-y-2">{stats.topRated.map((game) => <ProfileGameCard key={game.id} game={game} />)}</div>}
        </section>
        <section>
          <div className="text-xs uppercase text-[var(--text-muted)] mb-2 flex items-center gap-1.5"><Trophy size={12} /> Recently completed</div>
          {stats.recentlyCompleted.length === 0
            ? (
              <Empty>
                {stats.completed > 0
                  ? 'No completion dates yet — games get one from the moment they are moved into a completion list.'
                  : 'Nothing finished yet.'}
              </Empty>
            )
            : (
              <div className="space-y-2">
                {stats.recentlyCompleted.map((game) => (
                  <ProfileGameCard key={game.id} game={game} footer={formatDate(game.completedAt)} />
                ))}
              </div>
            )}
        </section>
      </div>
    </div>
  );
};

const BoardTab = ({ view }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    {view.columnOrder.map((colId) => {
      const column = view.columns[colId];
      const itemIds = column.itemIds || [];
      return (
        <div key={colId} className="bg-[var(--panel)] border border-[var(--border)] rounded-lg p-3 shadow-sm">
          <div className="text-sm font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
            <IconRenderer iconName={column.icon} size={14} />
            <span className="truncate">{column.title}</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">{itemIds.length}</span>
          </div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar">
            {itemIds.slice(0, 5).map((id) => (
              <div key={id} className="text-xs text-[var(--text)] truncate">{view.games?.[id]?.title || 'Untitled'}</div>
            ))}
            {itemIds.length === 0 && <div className="text-xs text-[var(--text-muted)]">Empty</div>}
            {itemIds.length > 5 && <div className="text-[11px] text-[var(--text-muted)]">+{itemIds.length - 5} more</div>}
          </div>
        </div>
      );
    })}
  </div>
);

const ProfilePage = ({
  user,
  relationships,
  getPublicProfile,
  loadProfileBoardModel,
  subscribeToUserGames,
  onFollowAction,
  onBlockAction,
  onUnblock,
}) => {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // State is keyed by the request that produced it, so "loading" is derived
  // (key mismatch) rather than set inside the effect.
  const [profileState, setProfileState] = useState({ uid: null, profile: null, error: null });
  const [boardState, setBoardState] = useState({ key: null, model: null, error: null });
  const [gamesState, setGamesState] = useState({ key: null, games: null, error: null });
  const [copied, setCopied] = useState(false);

  const isOwnProfile = !!user && uid === user.uid;
  const followEntry = relationships?.following?.[uid];
  const isBlocked = !!relationships?.blocked?.[uid];
  const isAcceptedFollower = relationships?.followers?.[uid]?.status === 'following';

  const isLoadingProfile = profileState.uid !== uid;
  const profile = isLoadingProfile ? null : profileState.profile;
  const profileError = isLoadingProfile ? null : profileState.error;

  // Load the public profile header.
  useEffect(() => {
    if (!uid || uid === 'me') return undefined;
    let cancelled = false;
    getPublicProfile(uid)
      .then((p) => {
        if (cancelled) return;
        if (!p || p.privacy === 'private') {
          setProfileState({ uid, profile: null, error: 'This profile is private or does not exist.' });
        } else {
          setProfileState({ uid, profile: p, error: null });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.code !== 'permission-denied') console.error('Failed to load profile', err);
        setProfileState({
          uid,
          profile: null,
          error: err?.code === 'permission-denied' ? 'This profile is private or does not exist.' : 'Could not load this profile.',
        });
      });
    return () => { cancelled = true; };
  }, [uid, getPublicProfile]);

  // Load the board document; the key includes the follow state so an accepted
  // request unlocks the board without a reload.
  const followStatus = followEntry?.status || (followEntry ? 'following' : 'none');
  const boardKey = profile && user ? `${profile.uid}:${user.uid}:${followStatus}` : null;
  const boardLoaded = !!boardKey && boardState.key === boardKey;
  const boardModel = boardLoaded ? boardState.model : null;
  const boardError = boardLoaded
    ? (boardState.error || (gamesState.key === boardKey ? gamesState.error : null))
    : null;

  useEffect(() => {
    if (!boardKey || !profile) return undefined;
    let cancelled = false;
    loadProfileBoardModel(profile.uid)
      .then((model) => { if (!cancelled) setBoardState({ key: boardKey, model, error: null }); })
      .catch((err) => {
        if (cancelled) return;
        setBoardState({ key: boardKey, model: null, error: lockedMessage(err, profile.privacy) });
      });
    return () => { cancelled = true; };
  }, [boardKey, profile, loadProfileBoardModel]);

  // Schema-2 owners keep their games in a subcollection, so the page follows it
  // live. A schema-1 owner (not migrated yet) already has them in the model.
  const needsGames = !!boardModel && boardModel.schemaVersion === 2;
  useEffect(() => {
    if (!needsGames || !boardKey || !profile) return undefined;
    return subscribeToUserGames(
      profile.uid,
      {},
      (games) => setGamesState({ key: boardKey, games, error: null }),
      (err) => setGamesState({ key: boardKey, games: [], error: lockedMessage(err, profile.privacy) }),
    );
  }, [needsGames, boardKey, profile, subscribeToUserGames]);

  const hasGames = !needsGames || gamesState.key === boardKey;
  const model = useMemo(() => {
    if (!boardModel || !hasGames) return null;
    return needsGames ? { ...boardModel, games: gamesById(gamesState.games || []) } : boardModel;
  }, [boardModel, needsGames, hasGames, gamesState.games]);

  const view = useMemo(() => (model ? toBoardView(model) : null), [model]);
  const stats = useMemo(() => (model ? computeUserStats(model) : null), [model]);
  // Four outcomes: waiting for auth, still loading, loaded with a board, or
  // loaded with none. Without a signed-in user the rules can't be evaluated at
  // all, so that is "loading", not "this player has no board".
  const isLoadingBoard = !!profile && (!user || (!boardError && (!boardLoaded || (!!boardModel && !view))));

  const columnTabs = view?.columnOrder || [];
  const requestedTab = searchParams.get('tab') || 'board';
  const activeTab = requestedTab === 'stats' || columnTabs.includes(requestedTab) ? requestedTab : 'board';
  const selectTab = (tab) => setSearchParams((params) => {
    const next = new URLSearchParams(params);
    if (tab === 'board') next.delete('tab');
    else next.set('tab', tab);
    return next;
  });

  if (uid === 'me') {
    if (!user) return <div className="pt-24 flex justify-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div>;
    return <Navigate to={`/u/${user.uid}${search}`} replace />;
  }

  const copyLink = async () => {
    const url = `${window.location.origin}/u/${uid}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this link', url);
    }
  };

  const followLabel = followEntry
    ? (followEntry.status === 'pending' ? 'Cancel request' : 'Unfollow')
    : (profile?.privacy === 'invite_only' ? 'Request to follow' : 'Follow');

  const tabButton = (key, label, icon, badge) => (
    <button
      key={key}
      onClick={() => selectTab(key)}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
        activeTab === key
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {icon}
      <span className="truncate max-w-[10rem]">{label}</span>
      {badge != null && <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{badge}</span>}
    </button>
  );

  const renderTab = () => {
    if (activeTab === 'stats') return <StatsTab stats={stats} />;
    if (activeTab === 'board') return <BoardTab view={view} />;
    const column = view.columns[activeTab];
    const games = (column.itemIds || []).map((id) => view.games[id]).filter(Boolean);
    if (games.length === 0) return <Empty>Nothing in {column.title} right now.</Empty>;
    return (
      <GameGrid
        games={games}
        footerFor={(game) => (column.isCompletion ? formatDate(game.completedAt) : null)}
      />
    );
  };

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-300">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6"
      >
        <ArrowLeft size={20} />
        <span className="font-semibold">Back to Board</span>
      </button>

      {isLoadingProfile ? (
        <div className="h-48 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-[var(--accent)]" /></div>
      ) : profileError ? (
        <div className="h-48 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--panel)]/30 gap-2">
          <Lock size={28} className="opacity-60" />
          <span>{profileError}</span>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="" className="w-16 h-16 rounded-full object-cover border border-[var(--border)]" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[var(--panel-muted)] text-[var(--text)] flex items-center justify-center uppercase font-bold text-2xl border border-[var(--border)]">
                  {profile.displayName?.[0] || 'P'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-[var(--text)] truncate">{profile.displayName}</h1>
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-1">
                  {profile.privacy === 'invite_only' ? <Shield size={12} /> : <Users size={12} />}
                  {profile.privacy === 'invite_only' ? 'Invite only' : 'Public profile'}
                  {isOwnProfile && <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/40">This is you</span>}
                  {!isOwnProfile && isAcceptedFollower && <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--panel-muted)] border border-[var(--border)]">Follows you</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--panel-muted)] border border-[var(--border)] text-[var(--text)] text-sm hover:border-[var(--accent)]"
                  title="Copy profile link"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <LinkIcon size={14} />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                {user && !isOwnProfile && !user.isAnonymous && (
                  isBlocked ? (
                    <button onClick={() => onUnblock(profile.uid)} className="px-3 py-1.5 rounded-lg bg-[var(--panel-muted)] border border-[var(--border)] text-[var(--text)] text-sm hover:border-[var(--accent)]">Unblock</button>
                  ) : (
                    <>
                      <button onClick={() => onFollowAction(profile)} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm font-semibold">
                        {followLabel}
                      </button>
                      <button onClick={() => onBlockAction(profile)} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm border border-red-200 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800">Block</button>
                    </>
                  )
                )}
                {user?.isAnonymous && !isOwnProfile && (
                  <span className="text-xs text-[var(--text-muted)] self-center">Sign in to follow players.</span>
                )}
              </div>
            </div>
            <p className="text-sm text-[var(--text)] mt-4">{profile.bio || 'No bio provided.'}</p>
          </div>

          <section>
            {isLoadingBoard ? (
              <div className="text-sm text-[var(--text-muted)]">Loading board...</div>
            ) : boardError ? (
              <Locked message={boardError} />
            ) : !view ? (
              <Empty>This player has no board yet.</Empty>
            ) : (
              <>
                <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] mb-4 custom-scrollbar">
                  {tabButton('board', 'Board', <LayoutGrid size={14} />)}
                  {columnTabs.map((colId) => tabButton(
                    colId,
                    view.columns[colId].title,
                    <IconRenderer iconName={view.columns[colId].icon} size={14} />,
                    view.columns[colId].itemIds.length,
                  ))}
                  {tabButton('stats', 'Stats', <BarChart3 size={14} />)}
                </div>
                {renderTab()}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
