import {
  collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore';
import { APP_ID, INITIAL_DATA } from '../config/constants';
import { db } from '../config/firebase';
import { createClientId, sameGameIdentity } from '../utils/gameUtils';

/*
 * Board data layer (schema v2 — per-game documents).
 *
 * Firestore, under artifacts/{APP_ID}/users/{uid}/:
 *   data/board      { columns: { [id]: { id, title, icon } }, columnOrder: [id],
 *                     schemaVersion: 2, updatedAt }
 *   games/{gameId}  { id, title, cover, coverIndex, rawgId?, rawgSlug?, externalSource?,
 *                     platform?, genre?, year?, columnId, position, rating, isFavorite,
 *                     addedAt, updatedAt, completedAt? }
 *
 * In memory the hook keeps a "model" of the same shape flattened into one object:
 *   { schemaVersion, columns, columnOrder, games: { [id]: gameDoc } }
 * and derives the pre-v2 view ({ columns[id].itemIds, games }) from it with
 * `toBoardView`, so the components keep working unchanged.
 *
 * Every pure function below takes a model and returns a *change*:
 *   { boardPatch?: { columns, columnOrder }, gameWrites: GameWrite[] }
 *   GameWrite = { id, data }              full document (create / replace)
 *             | { id, data, merge: true } partial update
 *             | { id, delete: true }
 * `applyChange` folds a change into a model (optimistic local state) and
 * `commitBoardChange` persists it as one write batch (chunked at 400 ops).
 */

export const GAMES_SCHEMA_VERSION = 2;
const BATCH_CHUNK = 400;
const MIN_GAP = 1e-6;

const boardDoc = (uid) => doc(db, 'artifacts', APP_ID, 'users', uid, 'data', 'board');
const gamesCollection = (uid) => collection(db, 'artifacts', APP_ID, 'users', uid, 'games');
const gameDoc = (uid, gameId) => doc(db, 'artifacts', APP_ID, 'users', uid, 'games', gameId);

export const isV2Board = (board) => !board || board.schemaVersion === GAMES_SCHEMA_VERSION;

const NO_CHANGE = Object.freeze({ gameWrites: [] });

/* ---------- model helpers ---------- */

export const emptyModel = () => ({
  schemaVersion: GAMES_SCHEMA_VERSION,
  columns: stripItemIds(INITIAL_DATA.columns),
  columnOrder: [...INITIAL_DATA.columnOrder],
  games: {},
});

const stripItemIds = (columns) => Object.fromEntries(
  Object.entries(columns || {}).map(([id, column]) => {
    const { itemIds: _ignored, ...rest } = column;
    return [id, { ...rest, id }];
  }),
);

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.id).localeCompare(String(b.id));

/** Games of one column, sorted by position. */
export const columnGames = (model, columnId) => Object.values(model.games || {})
  .filter((game) => game.columnId === columnId)
  .sort(byPosition);

/**
 * Derives the pre-v2 board shape the UI was written against:
 *   { columns: { [id]: { ...column, itemIds } }, columnOrder, games }
 */
export const toBoardView = (model) => {
  if (!model) return INITIAL_DATA;
  const columnOrder = Array.isArray(model.columnOrder) ? model.columnOrder : [];
  const buckets = {};
  columnOrder.forEach((id) => { buckets[id] = []; });
  Object.values(model.games || {}).forEach((game) => {
    if (buckets[game.columnId]) buckets[game.columnId].push(game);
  });
  const columns = {};
  columnOrder.forEach((id) => {
    const column = model.columns?.[id];
    if (!column) return;
    columns[id] = { ...column, itemIds: buckets[id].sort(byPosition).map((game) => game.id) };
  });
  return {
    columns,
    columnOrder: columnOrder.filter((id) => columns[id]),
    games: model.games || {},
    schemaVersion: model.schemaVersion,
  };
};

/**
 * Builds a model from a legacy (schema 1) board document: position = index in
 * `itemIds`. Games no column references are dropped, exactly like the old
 * `pruneOrphanedBoardData` did.
 */
export const modelFromLegacyBoard = (board) => {
  const games = {};
  const columns = {};
  const rawColumns = board?.columns || {};
  const columnOrder = (Array.isArray(board?.columnOrder) ? board.columnOrder : []).filter((id) => rawColumns[id]);
  columnOrder.forEach((columnId) => {
    const { itemIds, ...column } = rawColumns[columnId];
    columns[columnId] = { ...column, id: columnId };
    (Array.isArray(itemIds) ? itemIds : []).forEach((gameId, index) => {
      const game = board.games?.[gameId];
      if (!game || games[gameId]) return;
      games[gameId] = { ...game, id: gameId, columnId, position: index };
    });
  });
  return { schemaVersion: 1, columns, columnOrder, games };
};

/** Model → schema-1 document (used only while a user is still on schema 1). */
export const toLegacyBoardDoc = (model) => {
  const view = toBoardView(model);
  const games = {};
  Object.values(view.games).forEach((game) => {
    const { columnId: _c, position: _p, addedAt: _a, updatedAt: _u, ...rest } = game;
    games[game.id] = rest;
  });
  return { games, columns: view.columns, columnOrder: view.columnOrder };
};

/** Model → schema-2 board document (without the server timestamp). */
export const toBoardDoc = (model) => ({
  columns: stripItemIds(model.columns),
  columnOrder: [...(model.columnOrder || [])],
  schemaVersion: GAMES_SCHEMA_VERSION,
});

/* ---------- positions ---------- */

/** Midpoint between two neighbours; either side may be undefined. */
export const positionBetween = (before, after) => {
  if (before == null && after == null) return 0;
  if (before == null) return after - 1;
  if (after == null) return before + 1;
  return before + (after - before) / 2;
};

/**
 * Computes the writes needed to place `gameId` at `index` of `columnId`.
 * Normally one write (the moved game); when the neighbouring gap has collapsed
 * below MIN_GAP the whole column is renumbered with integer positions.
 */
const placeInColumn = (model, columnId, gameId, index, extraFields = {}) => {
  const others = columnGames(model, columnId).filter((game) => game.id !== gameId);
  const at = Math.max(0, Math.min(index, others.length));
  const before = others[at - 1]?.position;
  const after = others[at]?.position;
  const gap = before != null && after != null ? after - before : Infinity;

  if (gap >= MIN_GAP) {
    return [{ id: gameId, data: { ...extraFields, columnId, position: positionBetween(before, after) }, merge: true }];
  }

  const ordered = [...others.slice(0, at), { id: gameId }, ...others.slice(at)];
  return ordered.map((game, position) => (game.id === gameId
    ? { id: gameId, data: { ...extraFields, columnId, position }, merge: true }
    : { id: game.id, data: { position }, merge: true }));
};

/* ---------- pure change builders ---------- */

const mergeWrites = (...lists) => {
  // Later writes to the same id win / accumulate; a delete beats everything.
  const byId = new Map();
  lists.flat().forEach((write) => {
    const prev = byId.get(write.id);
    if (write.delete || prev?.delete) { byId.set(write.id, { id: write.id, delete: true }); return; }
    if (!prev || !write.merge) { byId.set(write.id, write); return; }
    byId.set(write.id, { ...prev, data: { ...prev.data, ...write.data } });
  });
  return [...byId.values()];
};

const duplicatesOf = (model, gameId, anchor) => Object.values(model.games || {})
  .filter((game) => game.id !== gameId && sameGameIdentity(game, anchor))
  .map((game) => ({ id: game.id, delete: true }));

/**
 * Removes other copies of the same game (by rawg id / slug / title). When
 * `targetColumnId` is given the surviving copy is also moved there (to the
 * top) if it currently lives somewhere else.
 */
export const cleanGameDuplicates = (model, gameId, title, targetColumnId = null) => {
  if (!gameId) return NO_CHANGE;
  const anchor = model.games?.[gameId] || { id: gameId, title };
  if (!anchor.title && !anchor.rawgId && !anchor.rawgSlug) return NO_CHANGE;

  let writes = duplicatesOf(model, gameId, anchor);
  if (targetColumnId && model.columns?.[targetColumnId] && model.games?.[gameId]
    && model.games[gameId].columnId !== targetColumnId) {
    writes = mergeWrites(writes, placeInColumn(model, targetColumnId, gameId, 0));
  }
  return { gameWrites: writes };
};

/** Drops undefined / null so the SDK accepts the document. */
const sanitizeGame = (game) => Object.fromEntries(
  Object.entries(game).filter(([, value]) => value !== undefined && value !== null),
);

export const addGameToBoardData = (model, game, targetColumnId, gameId) => {
  const target = model.columns?.[targetColumnId] ? targetColumnId : model.columnOrder[0];
  if (!target) return NO_CHANGE;
  const existing = Object.values(model.games || {}).find((stored) => sameGameIdentity(stored, game));
  if (existing) return moveGameOnBoardData(model, existing.id, target);

  const [placement, ...renumbered] = placeInColumn(model, target, gameId, 0);
  const data = sanitizeGame({
    coverIndex: 0,
    rating: 0,
    isFavorite: false,
    ...game,
    id: gameId,
    columnId: target,
    position: placement.data.position,
  });
  return {
    gameWrites: mergeWrites(
      [{ id: gameId, data }],
      renumbered,
      duplicatesOf({ ...model, games: { ...model.games, [gameId]: data } }, gameId, data),
    ),
  };
};

export const removeGameFromBoardData = (model, gameId) => (
  model.games?.[gameId] ? { gameWrites: [{ id: gameId, delete: true }] } : NO_CHANGE
);

/** Moves a game to the end of `targetColumnId`. */
export const moveGameOnBoardData = (model, gameId, targetColumnId) => {
  const game = model.games?.[gameId];
  if (!game || !model.columns?.[targetColumnId] || game.columnId === targetColumnId) return NO_CHANGE;
  const writes = placeInColumn(model, targetColumnId, gameId, Infinity);
  return { gameWrites: mergeWrites(writes, duplicatesOf(model, gameId, game)) };
};

/** Reorders a game inside its column (or into another one) at `index`. */
export const reorderGameOnBoardData = (model, gameId, columnId, index) => {
  const game = model.games?.[gameId];
  if (!game || !model.columns?.[columnId]) return NO_CHANGE;
  return { gameWrites: placeInColumn(model, columnId, gameId, index) };
};

export const toggleFavoriteOnBoardData = (model, gameId) => {
  const game = model.games?.[gameId];
  if (!game) return NO_CHANGE;
  return { gameWrites: [{ id: gameId, data: { isFavorite: !game.isFavorite }, merge: true }] };
};

export const patchGameOnBoardData = (model, gameId, fields) => {
  if (!model.games?.[gameId]) return NO_CHANGE;
  return { gameWrites: [{ id: gameId, data: sanitizeGame(fields), merge: true }] };
};

export const saveColumnToBoardData = (model, columnForm, isEditingColumn) => {
  if (isEditingColumn) {
    if (!model.columns?.[columnForm.id]) return NO_CHANGE;
    return {
      boardPatch: {
        columns: {
          ...model.columns,
          [columnForm.id]: { ...model.columns[columnForm.id], title: columnForm.title, icon: columnForm.icon },
        },
        columnOrder: model.columnOrder,
      },
      gameWrites: [],
    };
  }

  const id = columnForm.id || createClientId('col');
  return {
    boardPatch: {
      columns: { ...model.columns, [id]: { id, title: columnForm.title, icon: columnForm.icon } },
      columnOrder: [...model.columnOrder, id],
    },
    gameWrites: [],
  };
};

export const deleteColumnFromBoardData = (model, columnId, deleteMode, destinationColumnId) => {
  if (!model.columns?.[columnId]) return NO_CHANGE;
  const columnOrder = model.columnOrder.filter((id) => id !== columnId);
  const columns = { ...model.columns };
  delete columns[columnId];
  const orphans = columnGames(model, columnId);
  let gameWrites;

  if (deleteMode === 'move' && destinationColumnId && columns[destinationColumnId]) {
    // Prepend, keeping their relative order, in front of the destination's first game.
    const first = columnGames(model, destinationColumnId)[0]?.position;
    const start = first == null ? 0 : first - orphans.length;
    gameWrites = orphans.map((game, index) => ({
      id: game.id, data: { columnId: destinationColumnId, position: start + index }, merge: true,
    }));
  } else {
    gameWrites = orphans.map((game) => ({ id: game.id, delete: true }));
  }

  return { boardPatch: { columns, columnOrder }, gameWrites };
};

/* ---------- applying and committing changes ---------- */

export const isNoopChange = (change) => !change?.boardPatch && !(change?.gameWrites?.length);

/** Folds a change into the in-memory model (optimistic state). */
export const applyChange = (model, change) => {
  if (isNoopChange(change)) return model;
  const games = { ...model.games };
  (change.gameWrites || []).forEach((write) => {
    if (write.delete) delete games[write.id];
    else if (write.merge) games[write.id] = { ...games[write.id], ...write.data, id: write.id };
    else games[write.id] = { ...write.data, id: write.id };
  });
  return { ...model, ...(change.boardPatch || {}), games };
};

/**
 * Persists a change as write batches. The board document is written whenever
 * the change patches it or `includeBoard` is set (first write of a fresh
 * account, which has no board document yet).
 */
export const commitBoardChange = async (uid, model, change, { includeBoard = false } = {}) => {
  if (!uid || isNoopChange(change)) return;
  const writes = change.gameWrites || [];
  const batches = [];
  for (let i = 0; i < Math.max(1, Math.ceil(writes.length / BATCH_CHUNK)); i += 1) {
    const batch = writeBatch(db);
    writes.slice(i * BATCH_CHUNK, (i + 1) * BATCH_CHUNK).forEach((write) => {
      const ref = gameDoc(uid, write.id);
      if (write.delete) batch.delete(ref);
      else if (write.merge) batch.set(ref, { ...write.data, updatedAt: serverTimestamp() }, { merge: true });
      else batch.set(ref, { ...write.data, addedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    batches.push(batch);
  }
  if (change.boardPatch || includeBoard) {
    const next = { ...model, ...(change.boardPatch || {}) };
    batches[0].set(boardDoc(uid), { ...toBoardDoc(next), updatedAt: serverTimestamp() });
  }
  for (const batch of batches) await batch.commit();
};

/* ---------- subscriptions ---------- */

export const subscribeToBoard = (user, onBoard, onError = console.error) => {
  if (!user) return () => {};
  return onSnapshot(boardDoc(user.uid), (snapshot) => {
    onBoard(snapshot.exists() ? snapshot.data() : null);
  }, onError);
};

export const subscribeToGames = (user, onGames, onError = console.error) => {
  if (!user) return () => {};
  return onSnapshot(gamesCollection(user.uid), (snapshot) => {
    const games = {};
    snapshot.forEach((docSnap) => { games[docSnap.id] = { ...docSnap.data(), id: docSnap.id }; });
    onGames(games);
  }, onError);
};

/** One-off read of someone's board as the pre-v2 view (profile preview). */
export const loadBoardView = async (uid) => {
  const boardSnap = await getDoc(boardDoc(uid));
  if (!boardSnap.exists()) return null;
  const board = boardSnap.data();
  if (!isV2Board(board)) return toBoardView(modelFromLegacyBoard(board));
  const gamesSnap = await getDocs(gamesCollection(uid));
  const games = {};
  gamesSnap.forEach((docSnap) => { games[docSnap.id] = { ...docSnap.data(), id: docSnap.id }; });
  return toBoardView({ ...board, games });
};

/* ---------- guest → account merge ---------- */

/**
 * Copies the anonymous session's games into the signed-in user's board,
 * skipping games the target already has (same identity). Games whose column
 * id doesn't exist on the target land in its first column.
 */
export const mergeGuestBoardIntoUserBoard = async (guestModel, targetUid) => {
  const guestGames = Object.values(guestModel?.games || {});
  if (guestGames.length === 0) return;

  const targetSnap = await getDoc(boardDoc(targetUid));
  const targetBoard = targetSnap.exists() ? targetSnap.data() : null;

  if (targetBoard && !isV2Board(targetBoard)) {
    // Target account is still on schema 1: merge into the single document as before.
    const target = modelFromLegacyBoard(targetBoard);
    let model = target;
    guestGames.filter((game) => !Object.values(target.games).some((stored) => sameGameIdentity(stored, game)))
      .forEach((game) => {
        const columnId = model.columns[game.columnId] ? game.columnId : model.columnOrder[0];
        model = applyChange(model, { gameWrites: placeInColumn(model, columnId, game.id, Infinity, game) });
      });
    await setDoc(boardDoc(targetUid), toLegacyBoardDoc(model));
    return;
  }

  let model = targetBoard
    ? { ...targetBoard, games: {} }
    : emptyModel();
  const existingSnap = await getDocs(gamesCollection(targetUid));
  existingSnap.forEach((docSnap) => { model.games[docSnap.id] = { ...docSnap.data(), id: docSnap.id }; });

  const writes = [];
  guestGames
    .filter((game) => !Object.values(model.games).some((stored) => sameGameIdentity(stored, game)))
    .forEach((game) => {
      const columnId = model.columns[game.columnId] ? game.columnId : model.columnOrder[0];
      const { addedAt: _a, updatedAt: _u, ...fields } = game;
      const [placement, ...renumbered] = placeInColumn(model, columnId, game.id, Infinity);
      const data = sanitizeGame({ ...fields, columnId, position: placement.data.position });
      writes.push({ id: game.id, data }, ...renumbered);
      model = applyChange(model, { gameWrites: [{ id: game.id, data }, ...renumbered] });
    });

  await commitBoardChange(targetUid, model, { gameWrites: mergeWrites(writes) }, { includeBoard: !targetBoard });
};

/* ---------- misc ---------- */

export const createBoardGameFromRaw = (raw) => ({
  id: raw.id ? `rawg-${raw.id}` : createClientId('external-game'),
  rawgId: raw.id ? String(raw.id) : '',
  rawgSlug: raw.slug || '',
  externalSource: 'rawg',
  title: raw.name,
  platform: raw.platforms ? raw.platforms.map((item) => item.platform.name).slice(0, 2).join(', ') : 'Unknown',
  genre: raw.genres?.[0]?.name || '',
  year: raw.released?.split('-')[0] || '',
  cover: raw.background_image || '',
  coverIndex: 0,
  // The user's own rating, not RAWG's community score.
  rating: 0,
  isFavorite: false,
});
