import { useState, useEffect } from 'react';
import { 
  doc, onSnapshot, collection, query, where, getDocs, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db, APP_ID } from '../config/firebase';

const useRelationships = (user) => {
  const [following, setFollowing] = useState({});
  const [followers, setFollowers] = useState({});
  const [blocked, setBlocked] = useState({});
  const [requests, setRequests] = useState({});

  useEffect(() => {
    if (!user) {
      setFollowing({});
      setFollowers({});
      setBlocked({});
      setRequests({});
      return;
    }

    const base = ['artifacts', APP_ID, 'relationships', user.uid];
    const unsubFollowing = onSnapshot(collection(db, ...base, 'following'), (snap) => {
      const next = {};
      snap.forEach(d => { next[d.id] = d.data(); });
      setFollowing(next);
    });
    const unsubFollowers = onSnapshot(collection(db, ...base, 'followers'), (snap) => {
      const next = {};
      snap.forEach(d => { next[d.id] = d.data(); });
      setFollowers(next);
    });
    const unsubBlocked = onSnapshot(collection(db, ...base, 'blocked'), (snap) => {
      const next = {};
      snap.forEach(d => { next[d.id] = d.data(); });
      setBlocked(next);
    });
    const unsubRequests = onSnapshot(collection(db, ...base, 'requests'), (snap) => {
      const next = {};
      snap.forEach(d => { next[d.id] = d.data(); });
      setRequests(next);
    });

    return () => {
      unsubFollowing();
      unsubFollowers();
      unsubBlocked();
      unsubRequests();
    };
  }, [user]);

  const follow = async (profile) => {
    if (!user || !profile?.uid || profile.uid === user.uid) return { ok: false, error: 'invalid' };
    const status = profile.privacy === 'invite_only' ? 'pending' : 'following';
    const meBase = doc(db, 'artifacts', APP_ID, 'relationships', user.uid);
    const themBase = doc(db, 'artifacts', APP_ID, 'relationships', profile.uid);

    try {
      await setDoc(doc(meBase, 'following', profile.uid), {
        uid: profile.uid,
        displayName: profile.displayName || 'Player',
        photoURL: profile.photoURL || '',
        status,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (profile.privacy === 'invite_only') {
        await setDoc(doc(themBase, 'requests', user.uid), {
          uid: user.uid,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          status: 'pending',
          createdAt: serverTimestamp(),
        }, { merge: true });
      } else {
        await setDoc(doc(themBase, 'followers', user.uid), {
          uid: user.uid,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          status: 'following',
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      return { ok: true };
    } catch (err) {
      console.error("Follow failed", err);
      return { ok: false, error: err.message || 'Follow failed' };
    }
  };

  const unfollow = async (targetUid) => {
    if (!user || !targetUid) return { ok: false, error: 'invalid' };
    const meBase = doc(db, 'artifacts', APP_ID, 'relationships', user.uid);
    const themBase = doc(db, 'artifacts', APP_ID, 'relationships', targetUid);
    try {
      await deleteDoc(doc(meBase, 'following', targetUid));
      await deleteDoc(doc(themBase, 'followers', user.uid));
      return { ok: true };
    } catch (err) {
      console.error("Unfollow failed", err);
      return { ok: false, error: err.message || 'Unfollow failed' };
    }
  };

  const block = async (profile) => {
    if (!user || !profile?.uid || profile.uid === user.uid) return { ok: false, error: 'invalid' };
    const meBase = doc(db, 'artifacts', APP_ID, 'relationships', user.uid);
    const themBase = doc(db, 'artifacts', APP_ID, 'relationships', profile.uid);

    try {
      await setDoc(doc(meBase, 'blocked', profile.uid), {
        uid: profile.uid,
        displayName: profile.displayName || 'Player',
        photoURL: profile.photoURL || '',
        blockedAt: serverTimestamp(),
      }, { merge: true });

      await Promise.all([
        deleteDoc(doc(meBase, 'following', profile.uid)),
        deleteDoc(doc(meBase, 'followers', profile.uid)),
        deleteDoc(doc(themBase, 'followers', user.uid)),
        deleteDoc(doc(themBase, 'following', user.uid)),
      ]);
      return { ok: true };
    } catch (err) {
      console.error("Block failed", err);
      return { ok: false, error: err.message || 'Block failed' };
    }
  };

  const unblock = async (targetUid) => {
    if (!user || !targetUid) return { ok: false, error: 'invalid' };
    const meBase = doc(db, 'artifacts', APP_ID, 'relationships', user.uid);
    try {
      await deleteDoc(doc(meBase, 'blocked', targetUid));
      return { ok: true };
    } catch (err) {
      console.error("Unblock failed", err);
      return { ok: false, error: err.message || 'Unblock failed' };
    }
  };

  return {
    relationships: { following, followers, blocked, requests },
    follow,
    unfollow,
    block,
    unblock,
  };
};

export default useRelationships;
