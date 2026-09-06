// Unit tests for the schema 1 -> schema 2 migration builders (S3).
// Run from the repo root (gengemz/):
//   node --import ./tests/register-stubs.mjs tests/boardMigration.test.mjs
import assert from 'node:assert/strict';
import {
  modelFromLegacyBoard, normalizeGameForV2, toBoardView, GAMES_SCHEMA_VERSION,
} from '../frontend/src/services/boardService.js';

let passed = 0; let failed = 0;
const t = (name, fn) => {
  try { fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

// A board as the app wrote them before S2: RAWG's community score in `rating`,
// numeric ids inside the game objects, playlist leftovers, and a zombie game
// no column references (the old `merge: true` saves left those behind).
const legacyBoard = () => ({
  columns: {
    backlog: { id: 'backlog', title: 'To Play', icon: 'clock', itemIds: ['rawg-9767', 'g1700000000000'] },
    playing: { id: 'playing', title: 'Currently Playing', icon: 'gamepad', itemIds: ['rawg-3498'] },
    completed: { id: 'completed', title: 'Victory Road', icon: 'trophy', itemIds: [] },
    ghost: { id: 'ghost', title: 'Dropped from columnOrder', icon: 'ghost', itemIds: ['g-in-ghost'] },
  },
  columnOrder: ['backlog', 'playing', 'completed'],
  games: {
    'rawg-9767': {
      id: 9767, title: 'Hollow Knight', platform: 'PC, Nintendo Switch', genre: 'Indie',
      year: '2017', cover: 'https://x/hk.jpg', coverIndex: 0, rating: 4.42, isFavorite: true,
    },
    'g1700000000000': {
      id: 'g1700000000000', title: 'Tunic', platform: 'PC', genre: 'Adventure', year: '2022',
      cover: null, coverIndex: 2, rating: 8, isFavorite: false,
      originId: 'pl-1', sourceType: 'playlist', description: 'from a playlist import',
    },
    'rawg-3498': { id: 3498, title: 'GTA V', rating: 4, cover: 'https://x/gta.jpg' },
    zombie: { id: 'zombie', title: 'Zombie Left By Merge', rating: 0 },
    'g-in-ghost': { id: 'g-in-ghost', title: 'Orphan In Unlisted Column', rating: 3.5 },
  },
});

console.log('modelFromLegacyBoard');

t('positions follow itemIds order', () => {
  const { games } = modelFromLegacyBoard(legacyBoard());
  assert.equal(games['rawg-9767'].columnId, 'backlog');
  assert.equal(games['rawg-9767'].position, 0);
  assert.equal(games.g1700000000000.position, 1);
  assert.equal(games['rawg-3498'].columnId, 'playing');
  assert.equal(games['rawg-3498'].position, 0);
});

t('orphans land at the end of the first column', () => {
  const { games } = modelFromLegacyBoard(legacyBoard());
  // zombie (no column at all) and g-in-ghost (column missing from columnOrder)
  assert.equal(games.zombie.columnId, 'backlog');
  assert.equal(games['g-in-ghost'].columnId, 'backlog');
  const backlog = Object.values(games).filter((g) => g.columnId === 'backlog').sort((a, b) => a.position - b.position);
  assert.deepEqual(backlog.map((g) => g.id), ['rawg-9767', 'g1700000000000', 'zombie', 'g-in-ghost']);
});

t('a fractional RAWG rating is not a user score', () => {
  const { games } = modelFromLegacyBoard(legacyBoard());
  assert.equal(games['rawg-9767'].rating, 0);   // 4.42 came from RAWG
  assert.equal(games['g-in-ghost'].rating, 0);  // 3.5 likewise
  assert.equal(games.g1700000000000.rating, 8); // 8 can only be the star UI
  assert.equal(games['rawg-3498'].rating, 4);   // integer, kept
});

t('the game document id is the map key, not the RAWG number', () => {
  const { games } = modelFromLegacyBoard(legacyBoard());
  assert.equal(games['rawg-9767'].id, 'rawg-9767');
  assert.equal(typeof games['rawg-3498'].id, 'string');
});

t('unknown keys are dropped and required ones defaulted', () => {
  const { games } = modelFromLegacyBoard(legacyBoard());
  const tunic = games.g1700000000000;
  assert.equal(tunic.originId, undefined);
  assert.equal(tunic.sourceType, undefined);
  assert.equal(tunic.description, undefined);
  assert.equal(tunic.cover, undefined);          // null is dropped, not stored
  assert.equal(games['rawg-3498'].isFavorite, false);
  assert.equal(games['rawg-3498'].coverIndex, 0);
  assert.equal(games.zombie.title, 'Zombie Left By Merge');
  assert.ok(!('addedAt' in tunic) && !('updatedAt' in tunic));
});

t('every game matches the keys the v2 rules allow', () => {
  const allowed = new Set(['id', 'title', 'cover', 'coverIndex', 'rawgId', 'rawgSlug', 'externalSource',
    'platform', 'genre', 'year', 'columnId', 'position', 'rating', 'isFavorite', 'completedAt']);
  Object.values(modelFromLegacyBoard(legacyBoard()).games).forEach((game) => {
    Object.keys(game).forEach((key) => assert.ok(allowed.has(key), `unexpected key ${key}`));
    assert.equal(typeof game.title, 'string');
    assert.equal(typeof game.columnId, 'string');
    assert.equal(typeof game.position, 'number');
    assert.equal(typeof game.isFavorite, 'boolean');
    assert.ok(Number.isInteger(game.rating) && game.rating >= 0 && game.rating <= 10);
  });
});

t('itemIds are stripped from the columns and completed is flagged', () => {
  const { columns, columnOrder } = modelFromLegacyBoard(legacyBoard());
  assert.deepEqual(columnOrder, ['backlog', 'playing', 'completed']);
  assert.equal(columns.ghost, undefined);
  Object.values(columns).forEach((column) => assert.ok(!('itemIds' in column)));
  assert.equal(columns.completed.isCompletion, true);
  assert.equal(columns.backlog.isCompletion, undefined);
});

t('the visible board is unchanged by the migration', () => {
  const before = legacyBoard();
  const view = toBoardView(modelFromLegacyBoard(before));
  assert.deepEqual(view.columns.playing.itemIds, before.columns.playing.itemIds);
  assert.deepEqual(view.columns.backlog.itemIds.slice(0, 2), before.columns.backlog.itemIds);
  assert.equal(Object.keys(view.games).length, Object.keys(before.games).length);
});

t('re-running on an already migrated model changes nothing', () => {
  const once = modelFromLegacyBoard(legacyBoard());
  const view = toBoardView(once);
  const twice = modelFromLegacyBoard({ columns: view.columns, columnOrder: view.columnOrder, games: view.games });
  assert.deepEqual(twice.games, once.games);
  assert.deepEqual(twice.columns, once.columns);
});

t('a board whose default columns were renamed or deleted still migrates', () => {
  const model = modelFromLegacyBoard({
    columns: { mine: { id: 'mine', title: 'Mi lista', icon: 'sword', itemIds: ['a'] } },
    columnOrder: ['mine', 'deleted-column'],
    games: { a: { title: 'A', rating: 2 }, b: { title: 'B (orphan)', rating: 0 } },
  });
  assert.deepEqual(model.columnOrder, ['mine']);
  assert.equal(model.games.a.columnId, 'mine');
  assert.equal(model.games.b.columnId, 'mine');
  assert.equal(model.games.b.position, 1);
  assert.equal(model.columns.mine.isCompletion, undefined);
});

t('an empty or missing board does not throw', () => {
  assert.deepEqual(modelFromLegacyBoard({ columns: {}, columnOrder: [], games: {} }).games, {});
  assert.deepEqual(modelFromLegacyBoard(null).games, {});
  assert.deepEqual(modelFromLegacyBoard(undefined).columnOrder, []);
});

console.log('normalizeGameForV2');

t('clamps and coerces out-of-range values', () => {
  const game = normalizeGameForV2(
    { title: 42, rating: '7', coverIndex: '3', isFavorite: 'yes', year: 2017, platform: 'x'.repeat(300) },
    { id: 'g', columnId: 'c'.repeat(60), position: '2.5' },
  );
  assert.equal(game.title, '42');
  assert.equal(game.rating, 7);
  assert.equal(game.coverIndex, 3);
  assert.equal(game.isFavorite, false);      // only a real boolean true counts
  assert.equal(game.year, '2017');
  assert.equal(game.platform.length, 160);
  assert.equal(game.columnId.length, 40);
  assert.equal(game.position, 2.5);
});

t('a rating above the scale is clamped, a negative one floored', () => {
  assert.equal(normalizeGameForV2({ rating: 12 }, { id: 'g', columnId: 'c', position: 0 }).rating, 10);
  assert.equal(normalizeGameForV2({ rating: -3 }, { id: 'g', columnId: 'c', position: 0 }).rating, 0);
  assert.equal(normalizeGameForV2({ rating: 'nope' }, { id: 'g', columnId: 'c', position: 0 }).rating, 0);
});

t('completedAt survives only as a timestamp', () => {
  const date = new Date('2026-01-02T03:04:05Z');
  assert.equal(normalizeGameForV2({ completedAt: date }, { id: 'g', columnId: 'c', position: 0 }).completedAt, date);
  assert.equal(normalizeGameForV2({ completedAt: 'yesterday' }, { id: 'g', columnId: 'c', position: 0 }).completedAt, undefined);
});

t('schema version constant is 2', () => assert.equal(GAMES_SCHEMA_VERSION, 2));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
