import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_DATA } from '../config/constants';
import {
  addGameToBoardData,
  cleanGameDuplicates,
  deleteColumnFromBoardData,
  mergeGuestBoardIntoUserBoard,
  moveGameOnBoardData,
  patchGameOnBoardData,
  removeGameFromBoardData,
  saveColumnToBoardData,
  subscribeToBoard,
  toggleFavoriteOnBoardData,
} from '../services/boardService';
import { createClientId, findExistingGameId, getGameColumnId } from '../utils/gameUtils';
import useDebouncedSave from './useDebouncedSave';

const useBoard = (user) => {
  const [data, setData] = useState(INITIAL_DATA);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const dataRef = useRef(INITIAL_DATA);
  const { status: saveStatus, save: triggerSave } = useDebouncedSave(user);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const saveBoard = useCallback((updater) => {
    setData((prev) => {
      const newData = typeof updater === 'function' ? updater(prev) : updater;
      triggerSave(newData);
      return newData;
    });
  }, [triggerSave]);

  useEffect(() => {
    if (!user) return undefined;

    const timeout = setTimeout(() => setLoadedUserId(user.uid), 3000);
    const unsubscribe = subscribeToBoard(
      user,
      (boardData) => {
        clearTimeout(timeout);
        setData(boardData);
        setLoadedUserId(user.uid);
      },
      (error) => {
        clearTimeout(timeout);
        setLoadedUserId(user.uid);
        console.error('Board load failed', error);
      },
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [user]);

  const performSmartMigration = useCallback(async (guestData, targetUid) => {
    try {
      await mergeGuestBoardIntoUserBoard(guestData, targetUid);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const cleanDuplicates = useCallback((gameId, title, targetColumnId = null) => {
    saveBoard((prev) => cleanGameDuplicates(prev, gameId, title, targetColumnId));
  }, [saveBoard]);

  const addGameToBoard = useCallback((game, targetColumnId, preferredId = null) => {
    const gameId = preferredId || createClientId('game');
    saveBoard((prev) => addGameToBoardData(prev, game, targetColumnId || prev.columnOrder[0], gameId));
    return gameId;
  }, [saveBoard]);

  const ensureGameOnBoard = useCallback((game, targetColumnId = data.columnOrder[0]) => {
    if (!game) return null;
    const existingId = game.id && data.games[game.id] ? game.id : findExistingGameId(data, game);
    if (existingId) return existingId;
    return addGameToBoard(game, targetColumnId);
  }, [addGameToBoard, data]);

  const removeGame = useCallback((gameId) => {
    saveBoard((prev) => removeGameFromBoardData(prev, gameId));
  }, [saveBoard]);

  const moveGame = useCallback((gameId, targetColumnId) => {
    saveBoard((prev) => moveGameOnBoardData(prev, gameId, targetColumnId));
  }, [saveBoard]);

  const toggleFavorite = useCallback((gameId) => {
    saveBoard((prev) => toggleFavoriteOnBoardData(prev, gameId));
  }, [saveBoard]);

  const patchGame = useCallback((gameId, fields) => {
    saveBoard((prev) => patchGameOnBoardData(prev, gameId, fields));
  }, [saveBoard]);

  const setGameRating = useCallback((game, rating) => {
    const gameId = ensureGameOnBoard(game);
    if (!gameId) return null;
    saveBoard((prev) => cleanGameDuplicates(
      patchGameOnBoardData(prev, gameId, { rating }),
      gameId,
      game.title,
      getGameColumnId(data, gameId),
    ));
    return gameId;
  }, [data, ensureGameOnBoard, saveBoard]);

  const saveColumn = useCallback((columnForm, isEditingColumn) => {
    saveBoard((prev) => saveColumnToBoardData(prev, columnForm, isEditingColumn));
  }, [saveBoard]);

  const deleteColumn = useCallback((columnId, deleteMode, destinationColumnId) => {
    saveBoard((prev) => deleteColumnFromBoardData(prev, columnId, deleteMode, destinationColumnId));
  }, [saveBoard]);

  return {
    data,
    dataRef,
    isDataLoading: user ? loadedUserId !== user.uid : false,
    saveStatus,
    saveBoard,
    performSmartMigration,
    boardActions: {
      addGameToBoard,
      cleanDuplicates,
      deleteColumn,
      ensureGameOnBoard,
      moveGame,
      patchGame,
      removeGame,
      saveColumn,
      setGameRating,
      toggleFavorite,
    },
  };
};

export default useBoard;
