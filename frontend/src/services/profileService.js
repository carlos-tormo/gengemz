import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { APP_ID } from '../config/constants';
import { db } from '../config/firebase';
import {
  computeUserStats,
  getUserStats,
  loadBoardModel,
  loadBoardView,
  subscribeToUserGames,
} from './boardService';

const userDataDoc = (uid, docId) => doc(db, 'artifacts', APP_ID, 'users', uid, 'data', docId);
const publicProfileDoc = (uid) => doc(db, 'artifacts', APP_ID, 'public_profiles', uid);
const publicProfilesCollection = () => collection(db, 'artifacts', APP_ID, 'public_profiles');

const normalizeSearchText = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, ' ');

const buildSearchTokens = (displayName = '') => {
  const normalized = normalizeSearchText(displayName);
  if (!normalized) return [];

  const tokens = new Set();
  const addPrefixes = (text) => {
    const compact = text.replace(/\s+/g, '');
    [text, compact].filter(Boolean).forEach((candidate) => {
      const maxLength = Math.min(candidate.length, 20);
      for (let index = 1; index <= maxLength; index += 1) {
        tokens.add(candidate.slice(0, index));
      }
    });
  };

  addPrefixes(normalized);
  normalized.split(' ').forEach(addPrefixes);
  return Array.from(tokens).slice(0, 80);
};

const buildPublicProfilePayload = (user, settings) => {
  const displayName = settings.displayName || user.displayName || 'Player';
  return {
    uid: user.uid,
    displayName,
    displayNameLower: normalizeSearchText(displayName),
    searchTokens: buildSearchTokens(displayName),
    photoURL: user.photoURL || '',
    privacy: settings.privacy,
    bio: settings.bio || '',
  };
};

export const subscribeToUserSettings = (user, onSettings, onNeedsOnboarding, onError = console.error) => {
  if (!user) return () => {};

  return onSnapshot(userDataDoc(user.uid, 'settings'), (snapshot) => {
    if (snapshot.exists()) {
      const settings = snapshot.data();
      onSettings((prev) => ({
        ...prev,
        ...settings,
        displayName: settings.displayName || user.displayName || prev.displayName,
      }));
      if (!settings.privacy && !user.isAnonymous) {
        onNeedsOnboarding(true);
      }
      return;
    }

    onSettings((prev) => ({
      ...prev,
      displayName: user.displayName || prev.displayName,
    }));
    if (!user.isAnonymous) {
      onNeedsOnboarding(true);
    }
  }, onError);
};

export const saveUserSettings = async (user, settings) => {
  if (!user) return;

  await setDoc(userDataDoc(user.uid, 'settings'), settings, { merge: true });

  if (settings.privacy !== 'private') {
    await setDoc(publicProfileDoc(user.uid), buildPublicProfilePayload(user, settings), { merge: true });
    return;
  }

  await setDoc(publicProfileDoc(user.uid), {
    ...buildPublicProfilePayload(user, { ...settings, privacy: 'private' }),
    searchTokens: [],
  }, { merge: true });
};

export const completeQuestOnboarding = async (user) => {
  if (!user) return;

  await setDoc(userDataDoc(user.uid, 'settings'), { questOnboardingCompleted: true }, { merge: true });
};

export const createDebugProfiles = async (user) => {
  if (!user) return;

  const debugUsers = [
    { uid: 'debug_user_1', displayName: 'PixelWarrior', privacy: 'public', bio: 'I love RPGs', photoURL: '' },
    { uid: 'debug_user_2', displayName: 'RetroGamer99', privacy: 'public', bio: 'NES era best era', photoURL: '' },
    { uid: 'debug_user_3', displayName: 'SpeedRun_X', privacy: 'public', bio: 'Gotta go fast', photoURL: '' },
  ];

  await Promise.all(debugUsers.map((debugUser) => setDoc(publicProfileDoc(debugUser.uid), {
    ...debugUser,
    displayNameLower: normalizeSearchText(debugUser.displayName),
    searchTokens: buildSearchTokens(debugUser.displayName),
  })));
  await setDoc(publicProfileDoc(user.uid), buildPublicProfilePayload(user, {
    displayName: user.displayName || 'Me',
    privacy: 'public',
    bio: 'My profile',
  }), { merge: true });
};

export const searchPublicProfiles = async (searchQuery) => {
  const normalizedQuery = normalizeSearchText(searchQuery);
  if (!normalizedQuery) return [];

  const searchToken = normalizedQuery.replace(/\s+/g, '').slice(0, 20);
  const snapshots = await Promise.all(['public', 'invite_only'].map((privacy) => getDocs(query(
    publicProfilesCollection(),
    where('privacy', '==', privacy),
    where('searchTokens', 'array-contains', searchToken),
    limit(10),
  ))));

  const byUid = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.forEach((profileDoc) => {
      const profile = profileDoc.data();
      byUid.set(profile.uid || profileDoc.id, profile);
    });
  });

  return Array.from(byUid.values()).slice(0, 10);
};

export const getPublicProfile = async (uid) => {
  const snapshot = await getDoc(publicProfileDoc(uid));
  return snapshot.exists() ? { uid, ...snapshot.data() } : null;
};

// Returns the board in the pre-v2 view shape ({ columns[id].itemIds, games })
// whichever schema the owner is on.
export const loadProfileBoard = (uid) => loadBoardView(uid);

/*
 * Progression view (S4). The profile page loads the board *model* without its
 * games and then subscribes to them, so a friend's board stays live and each
 * game is read once. A schema-1 owner has no games collection — their games
 * come back inside the model and the subscription is skipped.
 */
export const loadProfileBoardModel = (uid) => loadBoardModel(uid, { withGames: false });

export { computeUserStats, getUserStats, subscribeToUserGames };
