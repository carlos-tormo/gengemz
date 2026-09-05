import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router';
import { ArrowLeft, Link as LinkIcon, Check, Lock, Loader2, Shield, Users } from 'lucide-react';

/**
 * Public profile page at /u/:uid.
 * Loads public_profiles/{uid}, wires follow / request / unfollow / block to
 * useRelationships, and shows the board preview when the rules allow it.
 */
const ProfilePage = ({
  user,
  relationships,
  getPublicProfile,
  loadProfileBoard,
  onFollowAction,
  onBlockAction,
  onUnblock,
}) => {
  const { uid } = useParams();
  const navigate = useNavigate();
  // State is keyed by the request that produced it, so "loading" is derived
  // (key mismatch) rather than set inside the effect.
  const [profileState, setProfileState] = useState({ uid: null, profile: null, error: null });
  const [boardState, setBoardState] = useState({ key: null, board: null, error: null });
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

  // Load the board preview; the key includes the follow state so an accepted
  // request unlocks the board without a reload.
  const followStatus = followEntry?.status || (followEntry ? 'following' : 'none');
  const boardKey = profile && user ? `${profile.uid}:${user.uid}:${followStatus}` : null;
  const isLoadingBoard = !!boardKey && boardState.key !== boardKey;
  const board = isLoadingBoard ? null : boardState.board;
  const boardError = isLoadingBoard ? null : boardState.error;

  useEffect(() => {
    if (!boardKey || !profile) return undefined;
    let cancelled = false;
    loadProfileBoard(profile.uid)
      .then((b) => { if (!cancelled) setBoardState({ key: boardKey, board: b, error: null }); })
      .catch((err) => {
        if (cancelled) return;
        let error = 'Could not load this board.';
        if (err?.code === 'permission-denied') {
          error = profile.privacy === 'invite_only'
            ? 'This board is invite only. Send a follow request to see it once accepted.'
            : 'You do not have access to this board.';
        } else {
          console.error('Failed to load profile board', err);
        }
        setBoardState({ key: boardKey, board: null, error });
      });
    return () => { cancelled = true; };
  }, [boardKey, profile, loadProfileBoard]);

  if (uid === 'me') {
    if (!user) return <div className="pt-24 flex justify-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div>;
    return <Navigate to={`/u/${user.uid}`} replace />;
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
            <div className="text-xs uppercase text-[var(--text-muted)] mb-2">Board Preview</div>
            {isLoadingBoard ? (
              <div className="text-sm text-[var(--text-muted)]">Loading board...</div>
            ) : boardError ? (
              <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl p-4 bg-[var(--panel)]/30">
                <Lock size={18} className="shrink-0 opacity-60" />
                <span>{boardError}</span>
              </div>
            ) : board ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(board.columnOrder || []).map((colId) => {
                  const col = board.columns?.[colId];
                  if (!col) return null;
                  const itemIds = col.itemIds || [];
                  return (
                    <div key={colId} className="bg-[var(--panel)] border border-[var(--border)] rounded-lg p-3 shadow-sm">
                      <div className="text-sm font-semibold text-[var(--text)] mb-2">{col.title}</div>
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {itemIds.slice(0, 5).map((id) => (
                          <div key={id} className="text-xs text-[var(--text)] truncate">{board.games?.[id]?.title || 'Untitled'}</div>
                        ))}
                        {itemIds.length === 0 && <div className="text-xs text-[var(--text-muted)]">Empty</div>}
                        {itemIds.length > 5 && <div className="text-[11px] text-[var(--text-muted)]">+{itemIds.length - 5} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-muted)]">This player has no board yet.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
