import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft, Ban, Check, Gamepad2, Loader2, UserCheck, UserPlus, Users,
} from 'lucide-react';
import { currentlyPlaying } from '../services/boardService';

/**
 * Connections page at /connections (S6). The Connections modal that used to
 * live in App.jsx became this page so every relationship list is linkable
 * (decision 6) and the Friends view has somewhere to be.
 *
 * Tabs are `?tab=`; Friends is the default. "Friend" is the mutual-follow
 * intersection computed in `useRelationships` (decision 1) — there is no
 * friends collection to read.
 */

const TABS = [
  { key: 'friends', label: 'Friends', icon: <UserCheck size={14} /> },
  { key: 'following', label: 'Following', icon: <UserPlus size={14} /> },
  { key: 'followers', label: 'Followers', icon: <Users size={14} /> },
  { key: 'requests', label: 'Requests', icon: <Check size={14} /> },
  { key: 'blocked', label: 'Blocked', icon: <Ban size={14} /> },
];

const Avatar = ({ profile }) => (
  profile.photoURL ? (
    <img src={profile.photoURL} alt="" className="w-10 h-10 rounded-full object-cover border border-[var(--border)] shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-[var(--panel-muted)] text-[var(--text)] flex items-center justify-center uppercase text-sm font-bold border border-[var(--border)] shrink-0">
      {profile.displayName?.[0] || 'P'}
    </div>
  )
);

const Empty = ({ children }) => (
  <div className="text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl p-6 text-center bg-[var(--panel)]/30">
    {children}
  </div>
);

const Row = ({ profile, subtitle, badge, children }) => (
  <div className="flex items-center gap-3 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-2.5 shadow-sm">
    <Avatar profile={profile} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)] truncate">{profile.displayName || 'Player'}</span>
        {badge}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{subtitle}</div>
    </div>
    <div className="flex items-center gap-2 shrink-0">{children}</div>
  </div>
);

const FriendBadge = () => (
  <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/40">
    Friend
  </span>
);

const secondaryButton = 'text-xs px-2.5 py-1 rounded-lg bg-[var(--panel-muted)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)]';
const dangerButton = 'text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-600 border border-red-200 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800';
const primaryButton = 'text-xs px-2.5 py-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-semibold';

/**
 * "Currently playing" for one friend: the first game of whichever list they
 * flagged `isPlaying` (decision 9 — never the literal id 'playing', which they
 * may have renamed or deleted). One board read plus one 1-document listener per
 * friend, and only on the Friends tab, so the cost scales with what is on
 * screen. A friend still on schema 1 carries their games inside the board
 * document, so no listener is needed for them.
 */
const CurrentlyPlaying = ({ uid, loadProfileBoardModel, subscribeToUserGames }) => {
  // The result is keyed by uid rather than reset at the top of the effect, so a
  // row that switches friend reads as loading without a synchronous setState.
  const [state, setState] = useState({ uid: null, status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;
    const settle = (next) => { if (!cancelled) setState({ uid, columnTitle: null, game: null, ...next }); };
    const failed = (err) => {
      if (cancelled) return;
      if (err?.code === 'permission-denied') { settle({ status: 'hidden' }); return; }
      console.error('Currently playing failed', err);
      settle({ status: 'error' });
    };

    loadProfileBoardModel(uid)
      .then((model) => {
        if (cancelled) return;
        const plan = currentlyPlaying(model);
        if (plan.status !== 'subscribe') { settle(plan); return; }
        unsubscribe = subscribeToUserGames(
          uid,
          { columnId: plan.columnId, limit: 1 },
          (games) => settle({ status: 'ready', columnTitle: plan.columnTitle, game: games[0] || null }),
          failed,
        );
      })
      .catch(failed);

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [uid, loadProfileBoardModel, subscribeToUserGames]);

  const current = state.uid === uid ? state : { status: 'loading' };
  if (current.status === 'loading') return <span className="opacity-60">Loading…</span>;
  if (current.status === 'hidden') return <span>Board not visible</span>;
  if (current.status === 'error') return <span>Could not load their board</span>;
  if (current.status === 'no-board') return <span>No board yet</span>;
  if (current.status === 'no-playing-column') return <span>No list marked as currently playing</span>;
  if (!current.game) return <span>Nothing in {current.columnTitle} right now</span>;
  return (
    <span className="flex items-center gap-1 min-w-0">
      <Gamepad2 size={11} className="shrink-0 text-[var(--accent)]" />
      <span className="text-[var(--text)] truncate">{current.game.title}</span>
    </span>
  );
};

const ConnectionsPage = ({
  user,
  isAuthLoading = false,
  isLoading = false,
  relationships,
  friends = [],
  onOpenProfile,
  onUnfollow,
  onUnblock,
  onRequestAction,
  onBlockAction,
  loadProfileBoardModel,
  subscribeToUserGames,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const following = useMemo(() => Object.values(relationships.following || {}), [relationships.following]);
  const followers = useMemo(() => Object.values(relationships.followers || {}), [relationships.followers]);
  const requests = useMemo(() => Object.values(relationships.requests || {}), [relationships.requests]);
  const blocked = useMemo(() => Object.values(relationships.blocked || {}), [relationships.blocked]);
  const friendUids = useMemo(() => new Set(friends.map((friend) => friend.uid)), [friends]);

  const counts = {
    friends: friends.length,
    following: following.length,
    followers: followers.length,
    requests: requests.length,
    blocked: blocked.length,
  };

  const requestedTab = searchParams.get('tab');
  const activeTab = TABS.some((tab) => tab.key === requestedTab) ? requestedTab : 'friends';
  const selectTab = (tab) => setSearchParams((params) => {
    const next = new URLSearchParams(params);
    if (tab === 'friends') next.delete('tab');
    else next.set('tab', tab);
    return next;
  });

  // Empty lists and lists that have not arrived yet look identical in the
  // state, and on a linkable page the difference is visible: a deep link would
  // otherwise open on "no friends yet" before the snapshots land.
  if (isAuthLoading || (user && isLoading)) {
    return (
      <div className="max-w-3xl mx-auto h-48 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto pt-10">
        <Empty>Sign in to see your connections.</Empty>
      </div>
    );
  }

  const viewButton = (profile) => (
    <button onClick={() => onOpenProfile(profile)} className={secondaryButton}>View</button>
  );

  const renderTab = () => {
    if (activeTab === 'friends') {
      if (friends.length === 0) {
        return (
          <Empty>
            No friends yet. A friend is someone you follow who follows you back — find players from
            the search box up top and follow them.
          </Empty>
        );
      }
      return (
        <div className="space-y-2">
          {friends.map((friend) => (
            <Row
              key={friend.uid}
              profile={friend}
              subtitle={(
                <CurrentlyPlaying
                  uid={friend.uid}
                  loadProfileBoardModel={loadProfileBoardModel}
                  subscribeToUserGames={subscribeToUserGames}
                />
              )}
            >
              {viewButton(friend)}
              <button onClick={() => onUnfollow(friend.uid)} className={dangerButton}>Unfollow</button>
            </Row>
          ))}
        </div>
      );
    }

    if (activeTab === 'following') {
      if (following.length === 0) return <Empty>Not following anyone yet.</Empty>;
      return (
        <div className="space-y-2">
          {following.map((profile) => (
            <Row
              key={profile.uid}
              profile={profile}
              badge={friendUids.has(profile.uid) ? <FriendBadge /> : null}
              subtitle={profile.status === 'pending' ? 'Request sent' : 'Following'}
            >
              {viewButton(profile)}
              <button onClick={() => onUnfollow(profile.uid)} className={dangerButton}>
                {profile.status === 'pending' ? 'Cancel request' : 'Unfollow'}
              </button>
            </Row>
          ))}
        </div>
      );
    }

    if (activeTab === 'followers') {
      if (followers.length === 0) return <Empty>No followers yet.</Empty>;
      return (
        <div className="space-y-2">
          {followers.map((profile) => (
            <Row
              key={profile.uid}
              profile={profile}
              badge={friendUids.has(profile.uid) ? <FriendBadge /> : null}
              subtitle={friendUids.has(profile.uid) ? 'You follow each other' : 'Follows you'}
            >
              {viewButton(profile)}
              <button onClick={() => onBlockAction(profile)} className={dangerButton}>Block</button>
            </Row>
          ))}
        </div>
      );
    }

    if (activeTab === 'requests') {
      if (requests.length === 0) return <Empty>No pending follow requests.</Empty>;
      return (
        <div className="space-y-2">
          {requests.map((profile) => (
            <Row key={profile.uid} profile={profile} subtitle="Wants to follow you">
              <button onClick={() => onRequestAction(profile, true)} className={primaryButton}>Accept</button>
              <button onClick={() => onRequestAction(profile, false)} className={secondaryButton}>Decline</button>
            </Row>
          ))}
        </div>
      );
    }

    if (blocked.length === 0) return <Empty>No blocked users.</Empty>;
    return (
      <div className="space-y-2">
        {blocked.map((profile) => (
          <Row key={profile.uid} profile={profile} subtitle="Blocked">
            <button onClick={() => onUnblock(profile.uid)} className={secondaryButton}>Unblock</button>
          </Row>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6"
      >
        <ArrowLeft size={20} />
        <span className="font-semibold">Back to Board</span>
      </button>

      <h1 className="text-2xl font-bold text-[var(--text)] mb-4">Connections</h1>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] mb-4 custom-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {renderTab()}
    </div>
  );
};

export default ConnectionsPage;
