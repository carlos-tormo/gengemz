import { useEffect, useMemo, useState } from 'react';
import {
  addGameToPlaylist,
  createPlaylist,
  deletePlaylist,
  getNextPlaceholderPlaylistTitle,
  removeGameFromPlaylist,
  removePlaylistItemAtIndex,
  subscribeToVisiblePlaylists,
  updatePlaylistFields,
} from '../services/playlistService';

const usePlaylists = (user) => {
  const [storedPlaylists, setStoredPlaylists] = useState([]);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToVisiblePlaylists(user, setStoredPlaylists, (message, error) => {
      console.error(message, error);
    });
    return unsubscribe;
  }, [user]);

  const playlists = useMemo(() => (user ? storedPlaylists : []), [storedPlaylists, user]);

  const myPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.ownerUid === user?.uid),
    [playlists, user?.uid],
  );

  const publicBrowsePlaylists = useMemo(
    () => playlists.filter((playlist) =>
      playlist.ownerUid && playlist.ownerUid !== user?.uid && playlist.privacy !== 'private',
    ),
    [playlists, user?.uid],
  );

  const applyPlaylistPatch = (playlistId, fields) => {
    setStoredPlaylists((prev) =>
      prev.map((playlist) => (playlist.id === playlistId ? { ...playlist, ...fields } : playlist)),
    );
  };

  const updateFields = async (playlistId, fields) => {
    await updatePlaylistFields(playlistId, fields);
    applyPlaylistPatch(playlistId, fields);
  };

  const removePlaylist = async (playlistId) => {
    await deletePlaylist(playlistId);
    setStoredPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
  };

  const createPlaceholderPlaylist = async (initialGame = null) => {
    setIsSavingPlaylist(true);
    try {
      const title = getNextPlaceholderPlaylistTitle(myPlaylists);
      const playlist = await createPlaylist({ user, title, initialGame });
      setStoredPlaylists((prev) => [playlist, ...prev]);
      return playlist;
    } finally {
      setIsSavingPlaylist(false);
    }
  };

  const addGame = async (playlistId, game) => {
    const result = await addGameToPlaylist(playlistId, game);
    if (!result.alreadyExists) {
      applyPlaylistPatch(playlistId, { items: result.items });
    }
    return result;
  };

  const removeGame = async (playlistId, game) => {
    const items = await removeGameFromPlaylist(playlistId, game);
    applyPlaylistPatch(playlistId, { items });
    return items;
  };

  const removeItemAtIndex = async (playlist, index) => {
    const items = await removePlaylistItemAtIndex(playlist, index);
    applyPlaylistPatch(playlist.id, { items });
    return items;
  };

  return {
    playlists,
    myPlaylists,
    publicBrowsePlaylists,
    isSavingPlaylist,
    playlistActions: {
      updateFields,
      removePlaylist,
      createPlaceholderPlaylist,
      addGame,
      removeGame,
      removeItemAtIndex,
    },
  };
};

export default usePlaylists;
