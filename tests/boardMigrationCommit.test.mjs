// End-to-end test of migrateLegacyBoard's reads and write batches against an
// in-memory Firestore. Run from the repo root (gengemz/):
//   GGZ_FAKE_FIRESTORE=1 node --import ./tests/register-stubs.mjs tests/boardMigrationCommit.test.mjs
import assert from 'node:assert/strict';
import { mergeGuestBoardIntoUserBoard, migrateLegacyBoard } from '../frontend/src/services/boardService.js';
import { commits, dump, reset, seed } from './fakeFirestore.mjs';

const BOARD = 'artifacts/gengemz-prod/users/u1/data/board';
const GAME = (id) => `artifacts/gengemz-prod/users/u1/games/${id}`;

let passed = 0; let failed = 0;
const t = async (name, fn) => {
  try { await fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

const seedLegacy = () => {
  reset();
  seed(BOARD, {
    columns: {
      backlog: { id: 'backlog', title: 'To Play', icon: 'clock', itemIds: ['a', 'b'] },
      completed: { id: 'completed', title: 'Victory Road', icon: 'trophy', itemIds: ['c'] },
    },
    columnOrder: ['backlog', 'completed'],
    games: {
      a: { id: 'a', title: 'Hollow Knight', rating: 4.42, isFavorite: true, cover: 'https://x/a.jpg' },
      b: { id: 'b', title: 'Tunic', rating: 8 },
      c: { id: 'c', title: 'Celeste', rating: 0 },
      zombie: { id: 'zombie', title: 'Left By Merge' },
    },
  });
};

console.log('migrateLegacyBoard');

await t('writes the board as v2 and one document per game', async () => {
  seedLegacy();
  const model = await migrateLegacyBoard('u1');
  const state = dump();
  assert.equal(model.schemaVersion, 2);
  assert.equal(state[BOARD].schemaVersion, 2);
  assert.ok(!('games' in state[BOARD]), 'the games map must be gone from the board');
  assert.ok(!('itemIds' in state[BOARD].columns.backlog));
  assert.equal(state[BOARD].columns.completed.isCompletion, true);
  assert.deepEqual(state[BOARD].columnOrder, ['backlog', 'completed']);
  ['a', 'b', 'c', 'zombie'].forEach((id) => assert.ok(state[GAME(id)], `missing game ${id}`));
  assert.equal(state[GAME('a')].rating, 0);   // RAWG float, not a user score
  assert.equal(state[GAME('b')].rating, 8);
  assert.equal(state[GAME('c')].columnId, 'completed');
  assert.equal(state[GAME('zombie')].columnId, 'backlog');
  assert.equal(state[GAME('zombie')].position, 2);
  assert.ok(state[GAME('a')].addedAt instanceof Date);
  assert.ok(state[GAME('a')].updatedAt instanceof Date);
});

await t('the board document is written in the last batch', async () => {
  seedLegacy();
  await migrateLegacyBoard('u1');
  const last = commits[commits.length - 1];
  assert.equal(last[last.length - 1].path, BOARD);
});

await t('a second run is a no-op', async () => {
  seedLegacy();
  await migrateLegacyBoard('u1');
  const before = commits.length;
  const again = await migrateLegacyBoard('u1');
  assert.equal(again, null);
  assert.equal(commits.length, before, 'a migrated board must not be written again');
});

await t('concurrent callers share one run', async () => {
  seedLegacy();
  const [first, second] = await Promise.all([migrateLegacyBoard('u1'), migrateLegacyBoard('u1')]);
  assert.equal(first, second);
  assert.equal(commits.length, 1);
});

await t('an interrupted run resumes without moving addedAt', async () => {
  seedLegacy();
  const addedAt = new Date('2025-01-01T00:00:00Z');
  seed(GAME('a'), { id: 'a', title: 'Hollow Knight', columnId: 'backlog', position: 0, rating: 0, isFavorite: true, addedAt, updatedAt: addedAt });
  await migrateLegacyBoard('u1');
  const write = commits.flat().find((operation) => operation.path === GAME('a'));
  assert.equal(write.merge, true, 'an existing game document must be patched, not recreated');
  assert.equal(dump()[GAME('a')].addedAt.getTime(), addedAt.getTime());
  assert.ok(dump()[GAME('b')].addedAt instanceof Date);
});

await t('over 400 games are chunked and the board still lands last', async () => {
  reset();
  const itemIds = [...Array(450).keys()].map((index) => `g${index}`);
  const games = Object.fromEntries(itemIds.map((id) => [id, { id, title: id, rating: 0 }]));
  seed(BOARD, { columns: { backlog: { id: 'backlog', title: 'To Play', itemIds } }, columnOrder: ['backlog'], games });
  await migrateLegacyBoard('u1');
  assert.equal(commits.length, 2);
  assert.equal(commits[0].length, 400);
  assert.equal(commits[1][commits[1].length - 1].path, BOARD);
  assert.equal(Object.keys(dump()).filter((path) => path.includes('/games/')).length, 450);
});

await t('a board with no games still flips to v2', async () => {
  reset();
  seed(BOARD, { columns: { backlog: { id: 'backlog', title: 'To Play', itemIds: [] } }, columnOrder: ['backlog'], games: {} });
  await migrateLegacyBoard('u1');
  assert.equal(dump()[BOARD].schemaVersion, 2);
});

await t('an account with no board document is left alone', async () => {
  reset();
  assert.equal(await migrateLegacyBoard('u1'), null);
  assert.equal(commits.length, 0);
});

console.log('mergeGuestBoardIntoUserBoard');

await t('a legacy target is migrated first, then merged as v2', async () => {
  seedLegacy();
  const guest = {
    columns: { backlog: { id: 'backlog' } },
    columnOrder: ['backlog'],
    games: {
      guest1: { id: 'guest1', title: 'Outer Wilds', columnId: 'backlog', position: 0, rating: 9, isFavorite: false },
      // same game as the target's "Tunic": must not be duplicated
      guest2: { id: 'guest2', title: 'Tunic', columnId: 'backlog', position: 1, rating: 0, isFavorite: false },
      // its column does not exist on the target: lands in the first one
      guest3: { id: 'guest3', title: 'Inscryption', columnId: 'gone', position: 0, rating: 0, isFavorite: false },
    },
  };
  await mergeGuestBoardIntoUserBoard(guest, 'u1');
  const state = dump();
  assert.equal(state[BOARD].schemaVersion, 2);
  assert.ok(!('games' in state[BOARD]));
  assert.ok(state[GAME('guest1')], 'guest game should be copied');
  assert.equal(state[GAME('guest1')].rating, 9);
  assert.equal(state[GAME('guest2')], undefined, 'a game the target already has must be skipped');
  assert.equal(state[GAME('guest3')].columnId, 'backlog');
  assert.ok(state[GAME('b')], 'the target board keeps its own games');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
