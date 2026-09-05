import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { APP_ID } from '../config/constants';
import { db } from '../config/firebase';
import { sameGameIdentity } from '../utils/gameUtils';

const playlistsCollection = () => collection(db, 'artifacts', APP_ID, 'playlists');
const playlistDoc = (playlistId) => doc(db, 'artifacts', APP_ID, 'playlists', playlistId);

const textOrEmpty = (value) => (value === undefined || value === null ? '' : String(value));
const numberOrZero = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const booleanOrFalse = (value) => (typeof value === 'boolean' ? value : false);

const stripUndefined = (value) => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;

  return Object.entries(value).reduce((cleaned, [key, fieldValue]) => {
    if (fieldValue !== undefined) {
      cleaned[key] = stripUndefined(fieldValue);
    }
    return cleaned;
  }, {});
};

export const playlistItemFromGame = (game) => ({
  title: textOrEmpty(game?.title || game?.name),
  platform: textOrEmpty(game?.platform),
  genre: textOrEmpty(game?.genre),
  year: textOrEmpty(game?.year),
  cover: textOrEmpty(game?.cover || game?.background_image),
  coverIndex: numberOrZero(game?.coverIndex),
  rating: numberOrZero(game?.rating),
  isFavorite: booleanOrFalse(game?.isFavorite),
  boardGameId: game?.rawgId ? '' : textOrEmpty(game?.id),
  rawgId: textOrEmpty(game?.rawgId),
  rawgSlug: textOrEmpty(game?.rawgSlug || game?.slug),
  originId: textOrEmpty(game?.id),
  originRawgId: textOrEmpty(game?.rawgId),
  originRawgSlug: textOrEmpty(game?.rawgSlug || game?.slug),
  sourceType: 'board',
});

export const findPlaylistForGame = (playlists, game) => {
  if (!game) return null;
  return playlists.find((playlist) =>
    (playlist.items || []).some((item) => sameGameIdentity(item, game)),
  ) || null;
};

export const getNextPlaceholderPlaylistTitle = (playlists) => {
  const baseName = 'New Playlist';
  const suffix = playlists.reduce((max, playlist) => {
    const match = playlist.title && playlist.title.match(/^New Playlist(?: \((\d+)\))?$/);
    if (!match) return max;
    const num = match[1] ? parseInt(match[1], 10) : 1;
    return Number.isNaN(num) ? max : Math.max(max, num);
  }, 0);
  const nextIndex = suffix ? suffix + 1 : 1;
  return nextIndex === 1 ? baseName : `${baseName} (${nextIndex})`;
};

export const subscribeToVisiblePlaylists = (user, onPlaylists, onError = console.error) => {
  if (!user) return () => {};

  let ownSnapshot = null;
  let publicSnapshot = null;

  const mergeSnapshots = () => {
    const byId = new Map();
    [ownSnapshot, publicSnapshot].filter(Boolean).forEach((snapshot) => {
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        byId.set(docSnapshot.id, {
          id: docSnapshot.id,
          ...data,
          ownerUid: data.ownerUid || 'unknown',
        });
      });
    });
    onPlaylists(Array.from(byId.values()));
  };

  const ownQuery = query(playlistsCollection(), where('ownerUid', '==', user.uid));
  const publicQuery = query(playlistsCollection(), where('privacy', '==', 'public'));

  const unsubscribeOwn = onSnapshot(ownQuery, (snapshot) => {
    ownSnapshot = snapshot;
    mergeSnapshots();
  }, (error) => onError('Owned playlists load failed', error));

  const unsubscribePublic = onSnapshot(publicQuery, (snapshot) => {
    publicSnapshot = snapshot;
    mergeSnapshots();
  }, (error) => onError('Public playlists load failed', error));

  return () => {
    unsubscribeOwn();
    unsubscribePublic();
  };
};

export const updatePlaylistFields = async (playlistId, fields) => {
  await updateDoc(playlistDoc(playlistId), {
    ...stripUndefined(fields),
    updatedAt: serverTimestamp(),
  });
};

export const deletePlaylist = async (playlistId) => {
  await deleteDoc(playlistDoc(playlistId));
};

export const createPlaylist = async ({ user, title, initialGame = null }) => {
  const payload = stripUndefined({
    title: textOrEmpty(title) || 'New Playlist',
    description: '',
    ownerUid: user?.uid || 'anon',
    ownerName: user?.displayName || 'Guest',
    privacy: 'public',
    items: initialGame ? [playlistItemFromGame(initialGame)] : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const ref = await addDoc(playlistsCollection(), payload);
  return { id: ref.id, ...payload };
};

export const addGameToPlaylist = async (playlistId, game) => {
  const ref = playlistDoc(playlistId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Playlist not found');

  const current = snapshot.data().items || [];
  const exists = current.some((item) => sameGameIdentity(item, game));
  if (exists) return { items: current, alreadyExists: true };

  const items = [...current, playlistItemFromGame(game)];
  await updatePlaylistFields(playlistId, { items });
  return { items, alreadyExists: false };
};

export const removeGameFromPlaylist = async (playlistId, game) => {
  const ref = playlistDoc(playlistId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return [];

  const items = (snapshot.data().items || []).filter(
    (item) => !sameGameIdentity(item, game),
  );
  await updatePlaylistFields(playlistId, { items });
  return items;
};

export const removePlaylistItemAtIndex = async (playlist, index) => {
  const items = playlist.items || [];
  const updatedItems = items.filter((_, itemIndex) => itemIndex !== index);
  await updatePlaylistFields(playlist.id, { items: updatedItems });
  return updatedItems;
};
