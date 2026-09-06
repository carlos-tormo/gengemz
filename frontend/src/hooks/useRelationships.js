import { useEffect, useMemo, useState } from 'react';
import {
  acceptFollowRequest,
  blockProfile,
  computeFeedSources,
  computeFriends,
  declineFollowRequest,
  followProfile,
  subscribeToRelationshipType,
  unblockProfile,
  unfollowProfile,
} from '../services/relationshipService';

const TYPES = ['following', 'followers', 'blocked', 'requests'];

const EMPTY_RELATIONSHIPS = {
  following: {},
  followers: {},
  blocked: {},
  requests: {},
};

const emptyState = (uid) => ({ uid, ...EMPTY_RELATIONSHIPS, delivered: {} });

/*
 * The four listeners are held as one state keyed by uid, for two reasons:
 * signing out or switching account must not leave the previous account's lists
 * on screen (and, since S6, must not fire board reads for their friends), and a
 * page — as opposed to the old modal — has to tell "no friends" apart from
 * "the snapshots have not arrived yet". `isLoading` is false only once all four
 * listeners have delivered for the current user.
 */
const useRelationships = (user) => {
  const [state, setState] = useState(emptyState(null));

  useEffect(() => {
    if (!user) return undefined;
    const { uid } = user;

    const update = (type, patch) => setState((prev) => {
      const base = prev.uid === uid ? prev : emptyState(uid);
      return { ...base, ...patch, delivered: { ...base.delivered, [type]: true } };
    });
    const receive = (type) => (value) => update(type, { [type]: value });
    // A listener that fails still counts as delivered: an empty list is wrong,
    // but a page stuck on its spinner is worse.
    const fail = (type) => (error) => {
      console.error(`Relationship listener failed (${type})`, error);
      update(type, {});
    };

    const unsubscribes = TYPES.map((type) => (
      subscribeToRelationshipType(user, type, receive(type), fail(type))
    ));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const isCurrent = !!user && state.uid === user.uid;

  const relationships = useMemo(() => {
    if (!isCurrent) return EMPTY_RELATIONSHIPS;
    const { following, followers, blocked, requests } = state;
    return { following, followers, blocked, requests };
  }, [isCurrent, state]);

  // Friends are derived, not stored (decision 1): the mutual-follow
  // intersection of the two listeners already open.
  const friends = useMemo(() => computeFriends(relationships), [relationships]);

  // The feed's authors (S7): accepted follows, not the mutual intersection —
  // `canViewActivity` asks whether I follow them, not whether they follow back.
  const feedSources = useMemo(() => computeFeedSources(relationships), [relationships]);

  return {
    relationships,
    friends,
    feedSources,
    // Nothing to load without a user, so this stays false rather than
    // promising a resolution that never comes.
    isLoading: !!user && (!isCurrent || TYPES.some((type) => !state.delivered[type])),
    follow: (profile) => followProfile(user, profile),
    unfollow: (targetUid) => unfollowProfile(user, targetUid),
    block: (profile) => blockProfile(user, profile),
    unblock: (targetUid) => unblockProfile(user, targetUid),
    acceptRequest: (requester) => acceptFollowRequest(user, requester),
    declineRequest: (requesterUid) => declineFollowRequest(user, requesterUid),
  };
};

export default useRelationships;
