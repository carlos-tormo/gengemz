import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_DATA } from '../config/constants';
import {
  addGameToBoardData,
  applyChange,
  cleanGameDuplicates,
  commitBoardChange,
  deleteColumnFromBoardData,
  emptyModel,
  isNoopChange,
  isV2Board,
  mergeGuestBoardIntoUserBoard,
  modelFromLegacyBoard,
  moveGameOnBoardData,
  patchGameOnBoardData,
  removeGameFromBoardData,
  reorderGameOnBoardData,
  saveColumnToBoardData,
  subscribeToBoard,
  subscribeToGames,
  toBoardView,
  toLegacyBoardDoc,
  toggleFavoriteOnBoardData,
} from '../services/boardService';
import { createClientId, findExistingGameId } from '../utils/gameUtils';
import useDebouncedSave from './useDebouncedSave';

/**
 * Owns the signed-in user's board.
 *
 * Schema 2 accounts (and brand-new accounts) get two listeners — data/board
 * and the games collection — and every action is committed immediately as a
 * write batch. Accounts still on schema 1 (until S3 migrates them) keep the
 * old debounced full-document save; both paths share the same in-memory
 * model and the same pure change builders.
 *
 * `data` is the pre-v2 view ({ columns[id].itemIds, games, columnOrder }) so
 * BoardPage, Column, GameCard, list view and favourites work unchanged.
 */
const useBoard = (user) => {
  // Keyed by uid so switching accounts never shows the previous user's board.
  const [modelState, setModelState] = useState({ uid: null, model: null });
  const model = user && modelState.uid === user.uid ? modelState.model : null;
  const [loadedUserId, setLoadedUserId] = useState(null);
  const modelRef = useRef(null);
  const modeRef = useRef('v2'); // 'v2' | 'legacy'
  const boardExistsRef = useRef(false);
  const { status: saveStatus, save: saveLegacy, run } = useDebouncedSave(user);

  const data = useMemo(() => toBoardView(model), [model]);
  const dataRef = useRef(INITIAL_DATA);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!user) return undefined;

    let board;          // undefined until the first board snapshot
    let games;          // undefined until the first games snapshot (v2 only)
    let unsubscribeGames = null;
    modelRef.current = null;
    const timeout = setTimeout(() => setLoadedUserId(user.uid), 3000);

    const publish = (next) => {
      clearTimeout(timeout);
      modelRef.current = next;
      setModelState({ uid: user.uid, model: next });
      setLoadedUserId(user.uid);
    };

    const fail = (error) => {
      clearTimeout(timeout);
      setLoadedUserId(user.uid);
      console.error('Board load failed', error);
    };

    const unsubscribeBoard = subscribeToBoard(user, (boardDoc) => {
      board = boardDoc;
      if (isV2Board(board)) {
        modeRef.current = 'v2';
        boardExistsRef.current = !!board;
        if (!unsubscribeGames) {
          unsubscribeGames = subscribeToGames(user, (nextGames) => {
            games = nextGames;
            publish({ ...(board || emptyModel()), games });
          }, fail);
        } else if (games !== undefined) {
          publish({ ...(board || emptyModel()), games });
        }
      } else {
        // Legacy schema 1 document — handled in place until S3 migrates it.
        modeRef.current = 'legacy';
        boardExistsRef.current = true;
        if (unsubscribeGames) { unsubscribeGames(); unsubscribeGames = null; }
        publish(modelFromLegacyBoard(board));
      }
    }, fail);

    return () => {
      clearTimeout(timeout);
      unsubscribeBoard();
      if (unsubscribeGames) unsubscribeGames();
    };
  }, [user]);

  /** Applies a change locally (optimistic) and persists it. */
  const commit = useCallback((change) => {
    if (isNoopChange(change)) return;
    const prev = modelRef.current || emptyModel();
    const next = applyChange(prev, change);
    modelRef.current = next;
    setModelState({ uid: user?.uid ?? null, model: next });
    if (!user) return;

    if (modeRef.current === 'legacy') {
      saveLegacy(toLegacyBoardDoc(next));
      return;
    }
    const includeBoard = !boardExistsRef.current;
    boardExistsRef.current = true;
    run(() => commitBoardChange(user.uid, prev, change, { includeBoard }));
  }, [user, saveLegacy, run]);

  const current = useCallback(() => modelRef.current || emptyModel(), []);

  const performSmartMigration = useCallback(async (guestData, targetUid) => {
    try {
      await mergeGuestBoardIntoUserBoard(guestData, targetUid);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const cleanDuplicates = useCallback((gameId, title, targetColumnId = null) => {
    commit(cleanGameDuplicates(current(), gameId, title, targetColumnId));
  }, [commit, current]);

  const addGameToBoard = useCallback((game, targetColumnId, preferredId = null) => {
    const gameId = preferredId || createClientId('game');
    const model = current();
    commit(addGameToBoardData(model, game, targetColumnId || model.columnOrder[0], gameId));
    return gameId;
  }, [commit, current]);

  const ensureGameOnBoard = useCallback((game, targetColumnId = null) => {
    if (!game) return null;
    const model = current();
    const existingId = game.id && model.games[game.id] ? game.id : findExistingGameId(model, game);
    if (existingId) return existingId;
    return addGameToBoard(game, targetColumnId || model.columnOrder[0]);
  }, [addGameToBoard, current]);

  const removeGame = useCallback((gameId) => {
    commit(removeGameFromBoardData(current(), gameId));
  }, [commit, current]);

  const moveGame = useCallback((gameId, targetColumnId) => {
    commit(moveGameOnBoardData(current(), gameId, targetColumnId));
  }, [commit, current]);

  const reorderGame = useCallback((gameId, columnId, index) => {
    commit(reorderGameOnBoardData(current(), gameId, columnId, index));
  }, [commit, current]);

  const toggleFavorite = useCallback((gameId) => {
    commit(toggleFavoriteOnBoardData(current(), gameId));
  }, [commit, current]);

  const patchGame = useCallback((gameId, fields) => {
    commit(patchGameOnBoardData(current(), gameId, fields));
  }, [commit, current]);

  const setGameRating = useCallback((game, rating) => {
    const gameId = ensureGameOnBoard(game);
    if (!gameId) return null;
    commit(patchGameOnBoardData(current(), gameId, { rating }));
    const columnId = current().games[gameId]?.columnId || null;
    commit(cleanGameDuplicates(current(), gameId, game.title, columnId));
    return gameId;
  }, [commit, current, ensureGameOnBoard]);

  const saveColumn = useCallback((columnForm, isEditingColumn) => {
    commit(saveColumnToBoardData(current(), columnForm, isEditingColumn));
  }, [commit, current]);

  const deleteColumn = useCallback((columnId, deleteMode, destinationColumnId) => {
    commit(deleteColumnFromBoardData(current(), columnId, deleteMode, destinationColumnId));
  }, [commit, current]);

  return {
    data,
    dataRef,
    isDataLoading: user ? loadedUserId !== user.uid : false,
    saveStatus,
    schemaVersion: model?.schemaVersion ?? null,
    performSmartMigration,
    boardActions: {
      addGameToBoard,
      cleanDuplicates,
      deleteColumn,
      ensureGameOnBoard,
      moveGame,
      patchGame,
      removeGame,
      reorderGame,
      saveColumn,
      setGameRating,
      toggleFavorite,
    },
  };
};

export default useBoard;
