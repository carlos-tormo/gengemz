import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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
    await deleteDoc(doc(myRoot, 'following', targetUid));
    await deleteDoc(doc(theirRoot, 'followers', user.uid));
    return { ok: true };
  } catch (error) {
    console.error('Unfollow failed', error);
    return { ok: false, error: error.message || 'Unfollow failed' };
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
