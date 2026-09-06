"use strict";

/*
 * Activity events (S5), pure part.
 *
 * Everything here is plain data in, plain data out: no Firebase imports, so
 * `tests/activityEvents.test.mjs` can run it in node without an emulator.
 * `activity.js` wraps it with the Firestore reads and writes.
 *
 * Event document (artifacts/{appId}/users/{uid}/activity/{eventId}):
 *   { appId, uid, type, createdAt,
 *     game?:     { id, title, cover, rawgId? },
 *     playlist?: { id, name },
 *     meta?:     { fromColumnId?, toColumnId?, columnTitle?, rating? } }
 *
 * `appId` and `uid` are stored on the document because the feed reads these
 * through a collection group query, where the path wildcards the rules would
 * otherwise use are not available.
 */

const GAME_ADDED = "game_added";
const GAME_STARTED = "game_started";
const GAME_COMPLETED = "game_completed";
const GAME_RATED = "game_rated";
const GAME_FAVORITED = "game_favorited";
const PLAYLIST_CREATED = "playlist_created";

const EVENT_TYPES = [
  GAME_ADDED,
  GAME_STARTED,
  GAME_COMPLETED,
  GAME_RATED,
  GAME_FAVORITED,
  PLAYLIST_CREATED,
];

// The star widget writes on every click, so a game rated 3 then 8 within a
// couple of minutes is one decision, not two events.
const RATING_DEBOUNCE_MS = 10 * 60 * 1000;

/* Milliseconds from a Firestore Timestamp, a Date, or a plain number. */
const toMillis = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value._seconds === "number") return value._seconds * 1000;
  return null;
};

const text = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLength);
};

const columnOf = (board, columnId) => {
  if (!board || !board.columns || !columnId) return null;
  return board.columns[columnId] || null;
};

const columnTitle = (board, columnId) => {
  const column = columnOf(board, columnId);
  return column ? text(column.title, 80) : "";
};

const isCompletionColumn = (board, columnId) => {
  const column = columnOf(board, columnId);
  return !!column && column.isCompletion === true;
};

const isPlayingColumn = (board, columnId) => {
  const column = columnOf(board, columnId);
  return !!column && column.isPlaying === true;
};

/* Drops empty keys so a card never renders `undefined`. */
const cleanMeta = (meta) => {
  const cleaned = {};
  Object.keys(meta || {}).forEach((key) => {
    const value = meta[key];
    if (value === undefined || value === null || value === "") return;
    cleaned[key] = value;
  });
  return cleaned;
};

/* The feed renders from this copy, so the card survives a deleted game. */
const gameSummary = (gameId, game) => {
  const summary = {
    id: String(gameId),
    title: text(game && game.title, 200),
    cover: text(game && game.cover, 1000),
  };
  const rawgId = text(game && game.rawgId, 40);
  if (rawgId) summary.rawgId = rawgId;
  return summary;
};

const playlistSummary = (playlistId, playlist) => ({
  id: String(playlistId),
  name: text(playlist && playlist.title, 120),
});

const moveMeta = (board, before, after) => cleanMeta({
  fromColumnId: before ? before.columnId : undefined,
  toColumnId: after.columnId,
  columnTitle: columnTitle(board, after.columnId),
});

/*
 * The events one write to a game document should produce.
 *
 * `before`/`after` are the document data (null when it did not exist) and
 * `board` is the owner's board document, used for the column flags and the
 * column title. Returns `[{ type, meta }]`, newest-first order irrelevant —
 * the caller stamps them all with the same server time.
 */
const deriveGameEvents = ({before, after, board}) => {
  // Deletions are handled by removing the game's events, not by adding one.
  if (!after) return [];

  // The schema 1 -> 2 migration writes every game document at once; a resumed
  // run re-stamps the ones it had already written. Either way `migratedAt`
  // moves, and none of it is something the user just did.
  if (toMillis(after.migratedAt) !== toMillis(before && before.migratedAt)) {
    return [];
  }

  if (!before) {
    return [{type: GAME_ADDED, meta: moveMeta(board, null, after)}];
  }

  const events = [];

  if (before.columnId !== after.columnId) {
    // S4 deletes `completedAt` when a game leaves a completion column, so its
    // presence is the authoritative signal; the column flag is the fallback
    // for an instance whose cached board predates the flag being ticked.
    const stamped = after.completedAt !== undefined &&
      after.completedAt !== null;
    const completed = stamped || isCompletionColumn(board, after.columnId);

    if (completed) {
      events.push({
        type: GAME_COMPLETED,
        meta: moveMeta(board, before, after),
      });
    } else if (isPlayingColumn(board, after.columnId)) {
      events.push({type: GAME_STARTED, meta: moveMeta(board, before, after)});
    }
  }
  // Ticking "games here count as finished" on a list stamps `completedAt` on
  // every game in it without moving any of them, so it produces nothing —
  // which is what S5 asks for.

  const rating = Number(after.rating);
  if (Number.isInteger(rating) && rating > 0 &&
      Number(before.rating) !== rating) {
    events.push({type: GAME_RATED, meta: {rating}});
  }

  if (after.isFavorite === true && before.isFavorite !== true) {
    events.push({type: GAME_FAVORITED, meta: {}});
  }

  return events;
};

/* Only a playlist that is public the moment it is created is announced. */
const derivePlaylistEvents = ({before, after}) => {
  if (before || !after || after.privacy !== "public") return [];
  if (!after.ownerUid) return [];
  return [{type: PLAYLIST_CREATED, meta: {}}];
};

/* False when the previous rating of the same game is still fresh. */
const shouldEmitRating = (previousCreatedAt, nowMs) => {
  const previous = toMillis(previousCreatedAt);
  if (previous === null) return true;
  return nowMs - previous >= RATING_DEBOUNCE_MS;
};

/*
 * A document id that is stable across retries of the same trigger event, so
 * the at-least-once delivery of Eventarc cannot double-post a card.
 */
const activityEventId = (triggerEventId, type) => {
  const safe = String(triggerEventId || "")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 200);
  return `${safe || "event"}_${type}`;
};

module.exports = {
  EVENT_TYPES,
  GAME_ADDED,
  GAME_STARTED,
  GAME_COMPLETED,
  GAME_RATED,
  GAME_FAVORITED,
  PLAYLIST_CREATED,
  RATING_DEBOUNCE_MS,
  activityEventId,
  cleanMeta,
  columnTitle,
  derivePlaylistEvents,
  deriveGameEvents,
  gameSummary,
  isCompletionColumn,
  isPlayingColumn,
  playlistSummary,
  shouldEmitRating,
  toMillis,
};
