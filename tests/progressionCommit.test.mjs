// The progression layer against an in-memory Firestore: sentinel translation on
// commit, and the queries the profile page and S6 rely on. Run from gengemz/:
//   GGZ_FAKE_FIRESTORE=1 node --import ./tests/register-stubs.mjs tests/progressionCommit.test.mjs
import assert from 'node:assert/strict';
import {
  addGameToBoardData,
  commitBoardChange,
  getUserGames,
  getUserStats,
  loadBoardModel,
  mergeGuestBoardIntoUserBoard,
  moveGameOnBoardData,
  saveColumnToBoardData,
} from '../frontend/src/services/boardService.js';
import { dump, reset, seed } from './fakeFirestore.mjs';

const BOARD = 'artifacts/gengemz-prod/users/u1/data/board';
const GAME = (id) => `artifacts/gengemz-prod/users/u1/games/${id}`;
const COMPLETED_AT = new Date('2026-08-01T00:00:00Z');

let passed = 0; let failed = 0;
const t = async (name, fn) => {
  try { await fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

const model = () => ({
  schemaVersion: 2,
  columns: {
    playing: { id: 'playing', title: 'Currently Playing', icon: 'gamepad' },
    completed: { id: 'completed', title: 'Victory Road', icon: 'trophy', isCompletion: true },
  },
  columnOrder: ['playing', 'completed'],
  games: {
    a: { id: 'a', title: 'Hollow Knight', columnId: 'playing', position: 0, rating: 9, isFavorite: true, platform: 'PC' },
    b: { id: 'b', title: 'Tunic', columnId: 'playing', position: 1, rating: 0, isFavorite: false, platform: 'PC' },
    c: { id: 'c', title: 'GTA V', columnId: 'completed', position: 0, rating: 7, isFavorite: false, completedAt: COMPLETED_AT },
  },
});

const seedV2 = () => {
  reset();
  const state = model();
  seed(BOARD, { columns: state.columns, columnOrder: state.columnOrder, schemaVersion: 2 });
  Object.values(state.games).forEach((game) => seed(GAME(game.id), game));
  return state;
};

console.log('sentinels reach Firestore as real values');

await t('entering a completion column writes a server timestamp', async () => {
  const state = seedV2();
  await commitBoardChange('u1', state, moveGameOnBoardData(state, 'a', 'completed'));
  const stored = dump()[GAME('a')];
  assert.equal(stored.columnId, 'completed');
  assert.ok(stored.completedAt instanceof Date, 'completedAt should be a resolved timestamp');
});

await t('leaving a completion column deletes the field', async () => {
  const state = seedV2();
  await commitBoardChange('u1', state, moveGameOnBoardData(state, 'c', 'playing'));
  const stored = dump()[GAME('c')];
  assert.equal(stored.columnId, 'playing');
  assert.ok(!('completedAt' in stored), 'completedAt should be gone, not null');
});

await t('unticking the flag clears every date in that list', async () => {
  const state = seedV2();
  const change = saveColumnToBoardData(state, { id: 'completed', title: 'Victory Road', icon: 'trophy', isCompletion: false }, true);
  await commitBoardChange('u1', state, change);
  assert.ok(!('completedAt' in dump()[GAME('c')]));
  assert.ok(!('isCompletion' in dump()[BOARD].columns.completed));
});

await t('a new game stamped on create stores a real timestamp', async () => {
  const state = seedV2();
  await commitBoardChange('u1', state, addGameToBoardData(state, { title: 'Hades' }, 'completed', 'new1'));
  const stored = dump()[GAME('new1')];
  assert.ok(stored.completedAt instanceof Date);
  assert.ok(stored.addedAt instanceof Date);
});

await t('a guest game keeps its date only if it lands in a completion column', async () => {
  const state = seedV2();
  await mergeGuestBoardIntoUserBoard({
    columns: state.columns,
    columnOrder: state.columnOrder,
    games: {
      g1: { id: 'g1', title: 'Outer Wilds', columnId: 'completed', position: 0, rating: 10, isFavorite: false, completedAt: COMPLETED_AT },
      g2: { id: 'g2', title: 'Braid', columnId: 'playing', position: 0, rating: 0, isFavorite: false, completedAt: COMPLETED_AT },
    },
  }, 'u1');
  const state2 = dump();
  assert.ok(state2[GAME('g1')].completedAt, 'a completion column keeps the date');
  assert.ok(!('completedAt' in state2[GAME('g2')]), 'an ordinary column must not carry one');
});

console.log('\nreads');

await t('loadBoardModel can skip the games collection', async () => {
  seedV2();
  const withGames = await loadBoardModel('u1');
  assert.deepEqual(Object.keys(withGames.games).sort(), ['a', 'b', 'c']);
  const shell = await loadBoardModel('u1', { withGames: false });
  assert.deepEqual(shell.games, {});
  assert.deepEqual(shell.columnOrder, ['playing', 'completed']);
});

await t('getUserGames filters by column and orders by position', async () => {
  seedV2();
  const playing = await getUserGames('u1', { columnId: 'playing' });
  assert.deepEqual(playing.map((game) => game.id), ['a', 'b']);
  const first = await getUserGames('u1', { columnId: 'playing', limit: 1 });
  assert.deepEqual(first.map((game) => game.id), ['a']);
  const after = await getUserGames('u1', { columnId: 'playing', cursor: 0 });
  assert.deepEqual(after.map((game) => game.id), ['b']);
});

await t('getUserStats reads a board end to end', async () => {
  seedV2();
  const stats = await getUserStats('u1');
  assert.equal(stats.total, 3);
  assert.equal(stats.completed, 1);
  assert.equal(stats.favorites, 1);
  assert.deepEqual(stats.recentlyCompleted.map((game) => game.id), ['c']);
});

await t('a user with no board has no stats', async () => {
  reset();
  assert.equal(await getUserStats('nobody'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
