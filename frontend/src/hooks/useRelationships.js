import { useEffect, useMemo, useState } from 'react';
import {
  blockProfile,
  followProfile,
  subscribeToRelationshipType,
  unblockProfile,
  unfollowProfile,
} from '../services/relationshipService';

const EMPTY_RELATIONSHIPS = {
  following: {},
  followers: {},
  blocked: {},
  requests: {},
};

const useRelationships = (user) => {
  const [following, setFollowing] = useState({});
  const [followers, setFollowers] = useState({});
  const [blocked, setBlocked] = useState({});
  const [requests, setRequests] = useState({});

  useEffect(() => {
    if (!user) return undefined;

    const unsubscribeFollowing = subscribeToRelationshipType(user, 'following', setFollowing);
    const unsubscribeFollowers = subscribeToRelationshipType(user, 'followers', setFollowers);
    const unsubscribeBlocked = subscribeToRelationshipType(user, 'blocked', setBlocked);
    const unsubscribeRequests = subscribeToRelationshipType(user, 'requests', setRequests);

    return () => {
      unsubscribeFollowing();
      unsubscribeFollowers();
      unsubscribeBlocked();
      unsubscribeRequests();
    };
  }, [user]);

  const relationships = useMemo(() => {
    if (!user) return EMPTY_RELATIONSHIPS;
    return { following, followers, blocked, requests };
  }, [blocked, followers, following, requests, user]);

  return {
    relationships,
    follow: (profile) => followProfile(user, profile),
    unfollow: (targetUid) => unfollowProfile(user, targetUid),
    block: (profile) => blockProfile(user, profile),
    unblock: (targetUid) => unblockProfile(user, targetUid),
  };
};

export default useRelationships;
