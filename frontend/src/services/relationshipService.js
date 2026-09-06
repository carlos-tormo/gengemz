import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { APP_ID } from '../config/constants';
import { db } from '../config/firebase';

const relationshipRoot = (uid) => doc(db, 'artifacts', APP_ID, 'relationships', uid);
const relationshipCollection = (uid, relationshipType) =>
  collection(db, 'artifacts', APP_ID, 'relationships', uid, relationshipType);

const snapshotToObject = (snapshot) => {
  const next = {};
  snapshot.forEach((document) => {
    next[document.id] = document.data();
  });
  return next;
};

export const subscribeToRelationshipType = (
  user,
  relationshipType,
  onRelationships,
  onError = console.error,
) => {
  if (!user) return () => {};
  return onSnapshot(
    relationshipCollection(user.uid, relationshipType),
    (snapshot) => onRelationships(snapshotToObject(snapshot)),
    onError,
  );
};

/*
 * Friends (S6) = mutual follow. Decision 1 keeps the relationship model
 * asymmetric, so there is no `friends` collection: a friend is someone I follow
 * with an accepted status who also sits in my followers. A still-`pending`
 * request to an invite-only profile is not a friendship.
 *
 * Pure so it can be unit-tested; the hook memoises it over the four listeners.
 */
export const computeFriends = ({ following = {}, followers = {}, blocked = {} } = {}) => (
  Object.values(following)
    .filter((entry) => entry?.uid
      && entry.status === 'following'
      && followers[entry.uid]
      // Blocking deletes both sides, but the four listeners are separate
      // snapshots: this keeps a just-blocked user out of the in-between frame.
      && !blocked[entry.uid])
    .map((entry) => {
      const follower = followers[entry.uid] || {};
      return {
        uid: entry.uid,
        // The followers entry is written from `user.displayName`, which can be
        // empty; the following entry comes from the public profile.
        displayName: entry.displayName || follower.displayName || 'Player',
        photoURL: entry.photoURL || follower.photoURL || '',
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
);

export const followProfile = async (user, profile) => {
  if (!user || !profile?.uid || profile.uid === user.uid) {
    return { ok: false, error: 'invalid' };
  }

  const status = profile.privacy === 'invite_only' ? 'pending' : 'following';
  const myRoot = relationshipRoot(user.uid);
  const theirRoot = relationshipRoot(profile.uid);

  try {
    await setDoc(doc(myRoot, 'following', profile.uid), {
      uid: profile.uid,
      displayName: profile.displayName || 'Player',
      photoURL: profile.photoURL || '',
      status,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (profile.privacy === 'invite_only') {
      await setDoc(doc(theirRoot, 'requests', user.uid), {
        uid: user.uid,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      }, { merge: true });
    } else {
      await setDoc(doc(theirRoot, 'followers', user.uid), {
        uid: user.uid,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        status: 'following',
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    return { ok: true };
  } catch (error) {
    console.error('Follow failed', error);
    return { ok: false, error: error.message || 'Follow failed' };
  }
};

export const unfollowProfile = async (user, targetUid) => {
  if (!user || !targetUid) return { ok: false, error: 'invalid' };

  const myRoot = relationshipRoot(user.uid);
  const theirRoot = relationshipRoot(targetUid);

  try {
    await Promise.all([
      deleteDoc(doc(myRoot, 'following', targetUid)),
      deleteDoc(doc(theirRoot, 'followers', user.uid)),
      // Withdraws a still-pending request to an invite-only profile.
      deleteDoc(doc(theirRoot, 'requests', user.uid)),
    ]);
    return { ok: true };
  } catch (error) {
    console.error('Unfollow failed', error);
    return { ok: false, error: error.message || 'Unfollow failed' };
  }
};

// Owner of an invite-only profile accepts a pending follow request.
// One atomic batch: the rules require the request doc to still exist while
// the followers entry is created and the requester's entry is flipped.
export const acceptFollowRequest = async (user, requester) => {
  if (!user || !requester?.uid || requester.uid === user.uid) {
    return { ok: false, error: 'invalid' };
  }

  const myRoot = relationshipRoot(user.uid);
  const theirRoot = relationshipRoot(requester.uid);

  try {
    const batch = writeBatch(db);
    batch.set(doc(myRoot, 'followers', requester.uid), {
      uid: requester.uid,
      displayName: requester.displayName || 'Player',
      photoURL: requester.photoURL || '',
      status: 'following',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(doc(theirRoot, 'following', user.uid), {
      uid: user.uid,
      displayName: user.displayName || 'Player',
      photoURL: user.photoURL || '',
      status: 'following',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    batch.delete(doc(myRoot, 'requests', requester.uid));
    await batch.commit();
    return { ok: true };
  } catch (error) {
    console.error('Accept request failed', error);
    return { ok: false, error: error.message || 'Accept failed' };
  }
};

// Owner declines (or later revokes) a pending request: removes it from both sides.
export const declineFollowRequest = async (user, requesterUid) => {
  if (!user || !requesterUid) return { ok: false, error: 'invalid' };

  try {
    await Promise.all([
      deleteDoc(doc(relationshipRoot(user.uid), 'requests', requesterUid)),
      deleteDoc(doc(relationshipRoot(requesterUid), 'following', user.uid)),
    ]);
    return { ok: true };
  } catch (error) {
    console.error('Decline request failed', error);
    return { ok: false, error: error.message || 'Decline failed' };
  }
};

export const blockProfile = async (user, profile) => {
  if (!user || !profile?.uid || profile.uid === user.uid) {
    return { ok: false, error: 'invalid' };
  }

  const myRoot = relationshipRoot(user.uid);
  const theirRoot = relationshipRoot(profile.uid);

  try {
    await setDoc(doc(myRoot, 'blocked', profile.uid), {
      uid: profile.uid,
      displayName: profile.displayName || 'Player',
      photoURL: profile.photoURL || '',
      blockedAt: serverTimestamp(),
    }, { merge: true });

    await Promise.all([
      deleteDoc(doc(myRoot, 'following', profile.uid)),
      deleteDoc(doc(myRoot, 'followers', profile.uid)),
      deleteDoc(doc(theirRoot, 'followers', user.uid)),
      deleteDoc(doc(theirRoot, 'following', user.uid)),
      deleteDoc(doc(myRoot, 'requests', profile.uid)),
      deleteDoc(doc(theirRoot, 'requests', user.uid)),
    ]);

    return { ok: true };
  } catch (error) {
    console.error('Block failed', error);
    return { ok: false, error: error.message || 'Block failed' };
  }
};

export const unblockProfile = async (user, targetUid) => {
  if (!user || !targetUid) return { ok: false, error: 'invalid' };

  try {
    await deleteDoc(doc(relationshipRoot(user.uid), 'blocked', targetUid));
    return { ok: true };
  } catch (error) {
    console.error('Unblock failed', error);
    return { ok: false, error: error.message || 'Unblock failed' };
  }
};
