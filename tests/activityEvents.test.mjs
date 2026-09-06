// Unit tests for the activity-event derivation (S5). Pure functions from
// functions/activityEvents.js — no emulator, no admin SDK. Run from the repo
// root (gengemz/):
//   node tests/activityEvents.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  GAME_ADDED, GAME_STARTED, GAME_COMPLETED, GAME_RATED, GAME_FAVORITED,
  PLAYLIST_CREATED, RATING_DEBOUNCE_MS,
  activityEventId, derivePlaylistEvents, deriveGameEvents, gameSummary,
  playlistSummary, shouldEmitRating, toMillis,
} = require('../functions/activityEvents.js');

let passed = 0; let failed = 0;
const t = (name, fn) => {
  try { fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

// The board the triggers read: one completion list, one "currently playing"
// list, and one plain list.
const board = {
  columns: {
    backlog: { id: 'backlog', title: 'To Play', icon: 'clock' },
    playing: { id: 'playing', title: 'Currently Playing', icon: 'gamepad', isPlaying: true },
    completed: { id: 'completed', title: 'Victory Road', icon: 'trophy', isCompletion: true },
    wishlist: { id: 'wishlist', title: 'Wishlist', icon: 'star' },
  },
  columnOrder: ['backlog', 'playing', 'completed', 'wishlist'],
};

const game = (extra = {}) => ({
  id: 'hk', title: 'Hollow Knight', cover: 'https://x/y.jpg', rawgId: '9767',
  columnId: 'backlog', position: 0, rating: 0, isFavorite: false, ...extra,
});
const types = (result) => result.map((event) => event.type);
const derive = (before, after) => deriveGameEvents({ before, after, board });

console.log('Creates');
t('a new game is added', () => {
  const result = derive(null, game());
  assert.deepEqual(types(result), [GAME_ADDED]);
  assert.deepEqual(result[0].meta, { toColumnId: 'backlog', columnTitle: 'To Play' });
});
t('a create carries no fromColumnId', () => {
  assert.equal('fromColumnId' in derive(null, game()).at(0).meta, false);
});
t('the S3 migration is silent', () => {
  assert.deepEqual(derive(null, game({ migratedAt: new Date() })), []);
});
t('a resumed migration re-stamping a document is silent', () => {
  const before = game({ migratedAt: new Date('2026-09-06T10:00:00Z') });
  const after = game({ migratedAt: new Date('2026-09-06T10:00:03Z'), columnId: 'completed' });
  assert.deepEqual(derive(before, after), []);
});
t('a migrated game still reports what the user does to it later', () => {
  const stamp = new Date('2026-09-06T10:00:00Z');
  const before = game({ migratedAt: stamp });
  const after = game({ migratedAt: stamp, columnId: 'playing' });
  assert.deepEqual(types(derive(before, after)), [GAME_STARTED]);
});

console.log('Moves');
t('moving into the playing list starts a game', () => {
  const result = derive(game(), game({ columnId: 'playing' }));
  assert.deepEqual(types(result), [GAME_STARTED]);
  assert.deepEqual(result[0].meta, {
    fromColumnId: 'backlog', toColumnId: 'playing', columnTitle: 'Currently Playing',
  });
});
t('moving into a completion list completes it', () => {
  const after = game({ columnId: 'completed', completedAt: new Date() });
  assert.deepEqual(types(derive(game(), after)), [GAME_COMPLETED]);
});
t('completedAt alone is enough when the cached board is stale', () => {
  const after = { ...game({ columnId: 'brand-new' }), completedAt: new Date() };
  assert.deepEqual(types(derive(game(), after)), [GAME_COMPLETED]);
});
t('the isCompletion flag is enough when completedAt has not landed yet', () => {
  assert.deepEqual(types(derive(game(), game({ columnId: 'completed' }))), [GAME_COMPLETED]);
});
t('moving between two ordinary lists says nothing', () => {
  assert.deepEqual(derive(game(), game({ columnId: 'wishlist' })), []);
});
t('leaving a completion list says nothing', () => {
  const before = game({ columnId: 'completed', completedAt: new Date() });
  assert.deepEqual(derive(before, game({ columnId: 'wishlist' })), []);
});
t('reordering inside a list says nothing', () => {
  assert.deepEqual(derive(game(), game({ position: 4 })), []);
});
t('ticking "counts as finished" on a whole list emits nothing', () => {
  // The S4 flag toggle stamps completedAt on every game without moving any.
  const after = game({ columnId: 'backlog', completedAt: new Date() });
  assert.deepEqual(derive(game(), after), []);
});

console.log('Ratings and favourites');
t('a first rating is reported', () => {
  const result = derive(game(), game({ rating: 8 }));
  assert.deepEqual(types(result), [GAME_RATED]);
  assert.deepEqual(result[0].meta, { rating: 8 });
});
t('changing a rating is reported', () => {
  assert.deepEqual(types(derive(game({ rating: 6 }), game({ rating: 9 }))), [GAME_RATED]);
});
t('clearing a rating is not', () => {
  assert.deepEqual(derive(game({ rating: 6 }), game({ rating: 0 })), []);
});
t('a rating that did not change is not', () => {
  assert.deepEqual(derive(game({ rating: 6 }), game({ rating: 6, position: 2 })), []);
});
t('favouriting is reported once', () => {
  assert.deepEqual(types(derive(game(), game({ isFavorite: true }))), [GAME_FAVORITED]);
  assert.deepEqual(derive(game({ isFavorite: true }), game({ isFavorite: true, position: 1 })), []);
});
t('unfavouriting is not', () => {
  assert.deepEqual(derive(game({ isFavorite: true }), game({ isFavorite: false })), []);
});
t('one write can produce several events', () => {
  const after = game({ columnId: 'completed', completedAt: new Date(), rating: 10, isFavorite: true });
  assert.deepEqual(types(derive(game(), after)), [GAME_COMPLETED, GAME_RATED, GAME_FAVORITED]);
});

console.log('Deletes, playlists, helpers');
t('a delete produces no event', () => {
  assert.deepEqual(derive(game(), null), []);
});
t('a public playlist is announced', () => {
  const result = derivePlaylistEvents({ before: null, after: { ownerUid: 'alice', privacy: 'public', title: 'Metroidvanias' } });
  assert.deepEqual(types(result), [PLAYLIST_CREATED]);
});
t('a private playlist is not', () => {
  assert.deepEqual(derivePlaylistEvents({ before: null, after: { ownerUid: 'alice', privacy: 'private', title: 'Secret' } }), []);
});
t('an ownerless playlist is not', () => {
  assert.deepEqual(derivePlaylistEvents({ before: null, after: { privacy: 'public', title: 'Orphan' } }), []);
});
t('an update to an existing playlist is not', () => {
  const doc = { ownerUid: 'alice', privacy: 'public', title: 'Metroidvanias' };
  assert.deepEqual(derivePlaylistEvents({ before: doc, after: doc }), []);
});
t('the game summary keeps only what a card renders', () => {
  assert.deepEqual(gameSummary('hk', game({ platform: 'PC', genre: 'Indie' })), {
    id: 'hk', title: 'Hollow Knight', cover: 'https://x/y.jpg', rawgId: '9767',
  });
});
t('the game summary drops an absent rawgId', () => {
  assert.equal('rawgId' in gameSummary('local-1', { title: 'Homebrew' }), false);
});
t('the playlist summary renames title to name', () => {
  assert.deepEqual(playlistSummary('p1', { title: 'Metroidvanias' }), { id: 'p1', name: 'Metroidvanias' });
});
t('a rating with no previous event passes the debounce', () => {
  assert.equal(shouldEmitRating(null, Date.now()), true);
});
t('a rating within ten minutes of the last one is dropped', () => {
  const now = Date.now();
  assert.equal(shouldEmitRating(new Date(now - 60_000), now), false);
  assert.equal(shouldEmitRating(new Date(now - RATING_DEBOUNCE_MS - 1), now), true);
});
t('the debounce reads a Firestore timestamp', () => {
  const now = Date.now();
  assert.equal(shouldEmitRating({ toMillis: () => now - 1000 }, now), false);
  assert.equal(toMillis({ seconds: 1_700_000_000 }), 1_700_000_000_000);
});
t('event ids are stable per trigger event and safe as document ids', () => {
  assert.equal(activityEventId('abc/123', GAME_RATED), 'abc_123_game_rated');
  assert.equal(activityEventId('e1', GAME_ADDED), activityEventId('e1', GAME_ADDED));
  assert.notEqual(activityEventId('e1', GAME_ADDED), activityEventId('e1', GAME_RATED));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
