"use strict";

/*
 * Activity events (S5), Firestore side.
 *
 * Three triggers, all writing through the admin SDK (so `firestore.rules`
 * denies every client write to `activity` without locking these out):
 *
 *   onGameWritten          artifacts/{appId}/users/{uid}/games/{gameId}
 *   onPublicPlaylistCreated  artifacts/{appId}/playlists/{playlistId}
 *   pruneActivityEvents    weekly retention sweep
 *
 * The derivation itself lives in `activityEvents.js` and is unit-tested
 * without an emulator; this file only reads, debounces and writes.
 */

const {onDocumentWritten, onDocumentCreated} =
  require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const events = require("./activityEvents");

if (!admin.apps.length) admin.initializeApp();

const db = () => admin.firestore();
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

const BATCH_CHUNK = 400;
// Board documents change far less often than games do, so one read per
// instance per minute is enough to classify a move.
const BOARD_CACHE_TTL_MS = 60 * 1000;
const BOARD_CACHE_MAX = 200;
// Kept per user; the sweep below deletes everything older.
const RETENTION_LIMIT = 200;

const boardCache = new Map();

const activityCollection = (appId, uid) => db()
    .collection("artifacts").doc(appId)
    .collection("users").doc(uid)
    .collection("activity");

const boardRef = (appId, uid) => db()
    .collection("artifacts").doc(appId)
    .collection("users").doc(uid)
    .collection("data").doc("board");

const loadBoard = async (appId, uid) => {
  const key = `${appId}/${uid}`;
  const cached = boardCache.get(key);
  if (cached && Date.now() - cached.at < BOARD_CACHE_TTL_MS) {
    return cached.board;
  }
  const snapshot = await boardRef(appId, uid).get();
  if (!snapshot.exists) {
    // A brand-new account writes its first game and its board document in one
    // batch; caching the miss would blind this instance for a minute.
    return null;
  }
  const board = snapshot.data();
  boardCache.set(key, {board, at: Date.now()});
  while (boardCache.size > BOARD_CACHE_MAX) {
    boardCache.delete(boardCache.keys().next().value);
  }
  return board;
};

const commitInChunks = async (writes) => {
  for (let i = 0; i < writes.length; i += BATCH_CHUNK) {
    const batch = db().batch();
    writes.slice(i, i + BATCH_CHUNK).forEach((write) => write(batch));
    await batch.commit();
  }
};

/*
 * Writes one document per derived event. The ids come from the trigger's own
 * event id, so a redelivered event overwrites its card instead of adding one.
 */
const writeEvents = async (appId, uid, triggerEventId, subject, derived) => {
  if (!derived.length) return;
  const collectionRef = activityCollection(appId, uid);
  await commitInChunks(derived.map((event) => (batch) => {
    const ref = collectionRef.doc(
        events.activityEventId(triggerEventId, event.type),
    );
    batch.set(ref, Object.assign({
      appId,
      uid,
      type: event.type,
      createdAt: serverTimestamp(),
      meta: event.meta || {},
    }, subject));
  }));
};

/* The most recent `game_rated` card for this game, or null. */
const lastRatedAt = async (appId, uid, gameId) => {
  const snapshot = await activityCollection(appId, uid)
      .where("type", "==", events.GAME_RATED)
      .where("game.id", "==", gameId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].get("createdAt");
};

/* A deleted game takes its cards with it. */
const deleteGameEvents = async (appId, uid, gameId) => {
  const snapshot = await activityCollection(appId, uid)
      .where("game.id", "==", gameId)
      .get();
  if (snapshot.empty) return 0;
  await commitInChunks(
      snapshot.docs.map((doc) => (batch) => batch.delete(doc.ref)),
  );
  return snapshot.size;
};

const dataOf = (snapshot) => (
  snapshot && snapshot.exists ? snapshot.data() : null
);

exports.onGameWritten = onDocumentWritten(
    "artifacts/{appId}/users/{uid}/games/{gameId}",
    async (event) => {
      const {appId, uid, gameId} = event.params;
      const before = dataOf(event.data && event.data.before);
      const after = dataOf(event.data && event.data.after);

      if (!after) {
        const removed = await deleteGameEvents(appId, uid, gameId);
        if (removed) {
          console.log(`activity: removed ${removed} events for ${gameId}`);
        }
        return;
      }

      const board = await loadBoard(appId, uid);
      const derived = events.deriveGameEvents({before, after, board});
      if (!derived.length) return;

      const now = Date.now();
      const kept = [];
      for (const item of derived) {
        if (item.type === events.GAME_RATED) {
          const previous = await lastRatedAt(appId, uid, gameId);
          if (!events.shouldEmitRating(previous, now)) continue;
        }
        kept.push(item);
      }
      if (!kept.length) return;

      await writeEvents(appId, uid, event.id, {
        game: events.gameSummary(gameId, after),
      }, kept);
    },
);

exports.onPublicPlaylistCreated = onDocumentCreated(
    "artifacts/{appId}/playlists/{playlistId}",
    async (event) => {
      const {appId, playlistId} = event.params;
      const playlist = dataOf(event.data);
      const derived = events.derivePlaylistEvents({
        before: null,
        after: playlist,
      });
      if (!derived.length) return;

      await writeEvents(appId, playlist.ownerUid, event.id, {
        playlist: events.playlistSummary(playlistId, playlist),
      }, derived);
    },
);

/* Keeps the newest RETENTION_LIMIT events of one user, deletes the rest. */
const pruneUser = async (userRef) => {
  const activity = userRef.collection("activity");
  const edge = await activity
      .orderBy("createdAt", "desc")
      .offset(RETENTION_LIMIT)
      .limit(1)
      .get();
  if (edge.empty) return 0;

  const cutoff = edge.docs[0].get("createdAt");
  let deleted = 0;
  for (;;) {
    const stale = await activity
        .where("createdAt", "<=", cutoff)
        .limit(BATCH_CHUNK)
        .get();
    if (stale.empty) break;
    await commitInChunks(
        stale.docs.map((doc) => (batch) => batch.delete(doc.ref)),
    );
    deleted += stale.size;
    if (stale.size < BATCH_CHUNK) break;
  }
  return deleted;
};

exports.pruneActivityEvents = onSchedule(
    {schedule: "every sunday 04:00", timeoutSeconds: 540, memory: "256MiB"},
    async () => {
      let deleted = 0;
      const artifacts = await db().collection("artifacts").listDocuments();
      for (const artifact of artifacts) {
        const users = await artifact.collection("users").listDocuments();
        for (const userRef of users) {
          deleted += await pruneUser(userRef);
        }
      }
      console.log(`activity: pruned ${deleted} events`);
    },
);
