import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { APP_ID, INITIAL_DATA } from '../config/constants';
import { db } from '../config/firebase';
import { createClientId, sameGameIdentity } from '../utils/gameUtils';

const boardDoc = (uid) => doc(db, 'artifacts', APP_ID, 'users', uid, 'data', 'board');

export const subscribeToBoard = (user, onBoard, onError = console.error) => {
  if (!user) return () => {};

  return onSnapshot(boardDoc(user.uid), (snapshot) => {
    onBoard(snapshot.exists() ? snapshot.data() : INITIAL_DATA);
  }, onError);
};

export const mergeGuestBoardIntoUserBoard = async (guestData, targetUid) => {
  if (!guestData?.games) return;

  const targetRef = boardDoc(targetUid);
  const snapshot = await getDoc(targetRef);
  let finalData = guestData;

  if (snapshot.exists()) {
    const target = snapshot.data();
    const mergedGames = { ...target.games, ...guestData.games };
    const mergedColumns = { ...target.columns };

    Object.keys(guestData.columns).forEach((columnId) => {
      if (mergedColumns[columnId]) {
        const newIds = guestData.columns[columnId].itemIds.filter(
          (id) => !mergedColumns[columnId].itemIds.includes(id),
        );
        mergedColumns[columnId].itemIds = [...mergedColumns[columnId].itemIds, ...newIds];
      }
    });

    finalData = {
      games: mergedGames,
      columns: mergedColumns,
      columnOrder: target.columnOrder || INITIAL_DATA.columnOrder,
    };
  }

  // Full overwrite (no merge) so removed games/columns don't survive server-side.
  await setDoc(targetRef, pruneOrphanedBoardData(finalData));
};

/**
 * Drops board entries nothing references any more:
 *  - column ids in `columnOrder` that have no column object
 *  - columns not listed in `columnOrder`
 *  - itemIds that point at games which no longer exist
 *  - games that no live column lists
 * Returns the same object when nothing needed pruning, so callers can use
 * identity to decide whether a re-save is needed.
 */
export const pruneOrphanedBoardData = (data) => {
  if (!data) return data;
  const games = data.games || {};
  const columns = data.columns || {};
  const columnOrder = Array.isArray(data.columnOrder) ? data.columnOrder : [];

  const liveOrder = columnOrder.filter((id) => columns[id]);
  const liveColumns = {};
  const referenced = new Set();
  let changed = liveOrder.length !== columnOrder.length
    || Object.keys(columns).length !== liveOrder.length;

  liveOrder.forEach((columnId) => {
    const column = columns[columnId];
    const rawIds = Array.isArray(column.itemIds) ? column.itemIds : [];
    const itemIds = rawIds.filter((gameId) => games[gameId] && !referenced.has(gameId));
    itemIds.forEach((gameId) => referenced.add(gameId));
    if (itemIds.length !== rawIds.length) changed = true;
    liveColumns[columnId] = itemIds === column.itemIds ? column : { ...column, itemIds };
  });

  const liveGames = {};
  Object.keys(games).forEach((gameId) => {
    if (referenced.has(gameId)) liveGames[gameId] = games[gameId];
    else changed = true;
  });

  if (!changed) return data;
  return { ...data, games: liveGames, columns: liveColumns, columnOrder: liveOrder };
};

export const createBoardGameFromRaw = (raw) => ({
  id: raw.id ? `rawg-${raw.id}` : createClientId('external-game'),
  rawgId: raw.id ? String(raw.id) : '',
  rawgSlug: raw.slug || '',
  externalSource: 'rawg',
  title: raw.name,
  platform: raw.platforms ? raw.platforms.map((item) => item.platform.name).slice(0, 2).join(', ') : 'Unknown',
  genre: raw.genres?.[0]?.name || '',
  year: raw.released?.split('-')[0] || '',
  cover: raw.background_image,
  coverIndex: 0,
  rating: raw.rating || 0,
  isFavorite: false,
});

export const cleanGameDuplicates = (data, gameId, title, targetColumnId = null) => {
  if (!gameId) return data;

  const games = { ...data.games };
  const anchorGame = games[gameId] || { id: gameId, title };
  if (!anchorGame.title && !anchorGame.rawgId && !anchorGame.rawgSlug) return data;
  const columns = { ...data.columns };
  const duplicateIds = Object.values(games)
    .filter((game) => game.id !== gameId && sameGameIdentity(game, anchorGame))
    .map((game) => game.id);

  duplicateIds.forEach((id) => {
    Object.keys(columns).forEach((columnId) => {
      if (columns[columnId].itemIds.includes(id)) {
        columns[columnId] = {
          ...columns[columnId],
          itemIds: columns[columnId].itemIds.filter((itemId) => itemId !== id),
        };
      }
    });
    delete games[id];
  });

  if (targetColumnId) {
    Object.keys(columns).forEach((columnId) => {
      if (columnId !== targetColumnId && columns[columnId].itemIds.includes(gameId)) {
        columns[columnId] = {
          ...columns[columnId],
          itemIds: columns[columnId].itemIds.filter((itemId) => itemId !== gameId),
        };
      }
    });

    if (!columns[targetColumnId].itemIds.includes(gameId)) {
      columns[targetColumnId] = {
        ...columns[targetColumnId],
        itemIds: [gameId, ...columns[targetColumnId].itemIds],
      };
    }
  }

  return { ...data, games, columns };
};

export const addGameToBoardData = (data, game, targetColumnId, gameId) => {
  const target = targetColumnId || data.columnOrder[0];
  const existingGame = Object.values(data.games || {}).find((storedGame) => sameGameIdentity(storedGame, game));
  if (existingGame) {
    return moveGameOnBoardData(data, existingGame.id, target);
  }

  const nextData = {
    ...data,
    games: {
      ...data.games,
      [gameId]: { ...game, id: gameId },
    },
    columns: {
      ...data.columns,
      [target]: {
        ...data.columns[target],
        itemIds: [gameId, ...data.columns[target].itemIds],
      },
    },
  };

  return cleanGameDuplicates(nextData, gameId, game.title, target);
};

export const removeGameFromBoardData = (data, gameId) => {
  const columnId = Object.keys(data.columns).find((id) => data.columns[id].itemIds.includes(gameId));
  const games = { ...data.games };
  delete games[gameId];
  const columns = { ...data.columns };

  if (columnId) {
    columns[columnId] = {
      ...columns[columnId],
      itemIds: columns[columnId].itemIds.filter((id) => id !== gameId),
    };
  }

  return { ...data, games, columns };
};

export const moveGameOnBoardData = (data, gameId, targetColumnId) => {
  const sourceColumnId = Object.keys(data.columns).find((id) => data.columns[id].itemIds.includes(gameId));
  if (!sourceColumnId || sourceColumnId === targetColumnId) return data;

  const nextData = {
    ...data,
    columns: {
      ...data.columns,
      [sourceColumnId]: {
        ...data.columns[sourceColumnId],
        itemIds: data.columns[sourceColumnId].itemIds.filter((id) => id !== gameId),
      },
      [targetColumnId]: {
        ...data.columns[targetColumnId],
        itemIds: [...data.columns[targetColumnId].itemIds, gameId],
      },
    },
  };

  return cleanGameDuplicates(nextData, gameId, data.games[gameId]?.title, targetColumnId);
};

export const toggleFavoriteOnBoardData = (data, gameId) => {
  const game = data.games[gameId];
  if (!game) return data;
  return {
    ...data,
    games: {
      ...data.games,
      [gameId]: { ...game, isFavorite: !game.isFavorite },
    },
  };
};

export const patchGameOnBoardData = (data, gameId, fields) => {
  const game = data.games[gameId];
  if (!game) return data;
  return {
    ...data,
    games: {
      ...data.games,
      [gameId]: { ...game, ...fields },
    },
  };
};

export const saveColumnToBoardData = (data, columnForm, isEditingColumn) => {
  if (isEditingColumn) {
    return {
      ...data,
      columns: {
        ...data.columns,
        [columnForm.id]: {
          ...data.columns[columnForm.id],
          title: columnForm.title,
          icon: columnForm.icon,
        },
      },
    };
  }

  return {
    ...data,
    columns: {
      ...data.columns,
      [columnForm.id]: {
        id: columnForm.id || createClientId('col'),
        title: columnForm.title,
        icon: columnForm.icon,
        itemIds: [],
      },
    },
    columnOrder: [...data.columnOrder, columnForm.id],
  };
};

export const deleteColumnFromBoardData = (data, columnId, deleteMode, destinationColumnId) => {
  const columnOrder = data.columnOrder.filter((id) => id !== columnId);
  const columns = { ...data.columns };
  const itemsToMove = columns[columnId]?.itemIds || [];
  let games = data.games;

  if (deleteMode === 'move' && destinationColumnId && columns[destinationColumnId]) {
    const deduped = itemsToMove.filter((id) => !columns[destinationColumnId].itemIds.includes(id));
    columns[destinationColumnId] = {
      ...columns[destinationColumnId],
      itemIds: [...deduped, ...columns[destinationColumnId].itemIds],
    };
  } else if (deleteMode === 'delete') {
    games = { ...data.games };
    itemsToMove.forEach((id) => {
      delete games[id];
    });
  }

  delete columns[columnId];
  return { ...data, columnOrder, columns, games };
};
