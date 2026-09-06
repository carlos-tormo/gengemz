// Unit tests for the progression layer (S4): the completedAt lifecycle and the
// profile stats. Pure functions only. Run from the repo root (gengemz/):
//   node --import ./tests/register-stubs.mjs tests/progression.test.mjs
import assert from 'node:assert/strict';
import {
  CLEAR_FIELD,
  SERVER_NOW,
  addGameToBoardData,
  applyChange,
  cleanGameDuplicates,
  computeUserStats,
  deleteColumnFromBoardData,
  isCompletionColumn,
  isPlayingColumn,
  moveGameOnBoardData,
  playingColumnId,
  patchGameOnBoardData,
  reorderGameOnBoardData,
  saveColumnToBoardData,
  toMillis,
} from '../frontend/src/services/boardService.js';

let passed = 0; let failed = 0;
const t = (name, fn) => {
  try { fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

// One board with a completion column ('completed') and two that are not.
const board = () => ({
  schemaVersion: 2,
  columns: {
    backlog: { id: 'backlog', title: 'To Play', icon: 'clock' },
    playing: { id: 'playing', title: 'Currently Playing', icon: 'gamepad' },
    completed: { id: 'completed', title: 'Victory Road', icon: 'trophy', isCompletion: true },
  },
  columnOrder: ['backlog', 'playing', 'completed'],
  games: {
    a: { id: 'a', title: 'Hollow Knight', columnId: 'playing', position: 0, rating: 9, isFavorite: true, platform: 'PC, Nintendo Switch' },
    b: { id: 'b', title: 'Tunic', columnId: 'backlog', position: 0, rating: 0, isFavorite: false, platform: 'PC' },
    c: { id: 'c', title: 'GTA V', columnId: 'completed', position: 0, rating: 7, isFavorite: false, platform: 'PlayStation 5', completedAt: new Date('2026-08-01T00:00:00Z') },
    d: { id: 'd', title: 'Celeste', columnId: 'completed', position: 1, rating: 9, isFavorite: false, completedAt: new Date('2026-09-01T00:00:00Z') },
  },
});

const writeFor = (change, id) => change.gameWrites.find((write) => write.id === id);

console.log('completedAt lifecycle');

t('a column is only a completion column when the flag says so', () => {
  const model = board();
  assert.equal(isCompletionColumn(model, 'completed'), true);
  assert.equal(isCompletionColumn(model, 'playing'), false);
  assert.equal(isCompletionColumn(model, 'nope'), false);
});

t('moving into a completion column stamps completedAt', () => {
  const change = moveGameOnBoardData(board(), 'a', 'completed');
  assert.equal(writeFor(change, 'a').data.columnId, 'completed');
  assert.equal(writeFor(change, 'a').data.completedAt, SERVER_NOW);
});

t('moving out of a completion column clears completedAt', () => {
  const change = moveGameOnBoardData(board(), 'c', 'playing');
  assert.equal(writeFor(change, 'c').data.completedAt, CLEAR_FIELD);
});

t('a move between two ordinary columns leaves completedAt alone', () => {
  const change = moveGameOnBoardData(board(), 'b', 'playing');
  assert.ok(!('completedAt' in writeFor(change, 'b').data));
});

t('reordering inside the completion column does not re-stamp', () => {
  const change = reorderGameOnBoardData(board(), 'd', 'completed', 0);
  assert.ok(!('completedAt' in writeFor(change, 'd').data));
});

t('dragging into the completion column stamps, dragging out clears', () => {
  assert.equal(writeFor(reorderGameOnBoardData(board(), 'b', 'completed', 0), 'b').data.completedAt, SERVER_NOW);
  assert.equal(writeFor(reorderGameOnBoardData(board(), 'c', 'backlog', 0), 'c').data.completedAt, CLEAR_FIELD);
});

t('a game added straight into the completion column is stamped on create', () => {
  const change = addGameToBoardData(board(), { title: 'Hades' }, 'completed', 'new1');
  assert.equal(writeFor(change, 'new1').data.completedAt, SERVER_NOW);
  assert.ok(!writeFor(change, 'new1').merge, 'a new game is a full document write');
});

t('a game added to an ordinary column has no completedAt', () => {
  const change = addGameToBoardData(board(), { title: 'Hades' }, 'backlog', 'new1');
  assert.ok(!('completedAt' in writeFor(change, 'new1').data));
});

t('the duplicate cleanup stamps when it moves a game into the completion column', () => {
  const change = cleanGameDuplicates(board(), 'a', 'Hollow Knight', 'completed');
  assert.equal(writeFor(change, 'a').data.completedAt, SERVER_NOW);
});

t('deleting a column and moving its games follows the same rule', () => {
  const intoCompleted = deleteColumnFromBoardData(board(), 'playing', 'move', 'completed');
  assert.equal(writeFor(intoCompleted, 'a').data.completedAt, SERVER_NOW);
  const outOfCompleted = deleteColumnFromBoardData(board(), 'completed', 'move', 'backlog');
  assert.equal(writeFor(outOfCompleted, 'c').data.completedAt, CLEAR_FIELD);
  assert.equal(writeFor(outOfCompleted, 'd').data.completedAt, CLEAR_FIELD);
});

t('a patch that also moves the game keeps completedAt in step', () => {
  const intoCompleted = patchGameOnBoardData(board(), 'a', { columnId: 'completed', position: 5 });
  assert.equal(writeFor(intoCompleted, 'a').data.completedAt, SERVER_NOW);
  const outOfCompleted = patchGameOnBoardData(board(), 'c', { columnId: 'backlog', position: 5 });
  assert.equal(writeFor(outOfCompleted, 'c').data.completedAt, CLEAR_FIELD);
  const rating = patchGameOnBoardData(board(), 'c', { rating: 10 });
  assert.ok(!('completedAt' in writeFor(rating, 'c').data));
});

console.log('\nthe isCompletion flag in the list editor');

t('ticking the flag stamps the games already in the list', () => {
  const change = saveColumnToBoardData(board(), { id: 'playing', title: 'Currently Playing', icon: 'gamepad', isCompletion: true }, true);
  assert.equal(change.boardPatch.columns.playing.isCompletion, true);
  assert.equal(writeFor(change, 'a').data.completedAt, SERVER_NOW);
});

t('unticking the flag removes the key and clears the dates', () => {
  const change = saveColumnToBoardData(board(), { id: 'completed', title: 'Victory Road', icon: 'trophy', isCompletion: false }, true);
  assert.ok(!('isCompletion' in change.boardPatch.columns.completed));
  assert.equal(writeFor(change, 'c').data.completedAt, CLEAR_FIELD);
  assert.equal(writeFor(change, 'd').data.completedAt, CLEAR_FIELD);
});

t('renaming a completion list keeps the flag and touches no game', () => {
  const change = saveColumnToBoardData(board(), { id: 'completed', title: 'Finished', icon: 'trophy', isCompletion: true }, true);
  assert.equal(change.boardPatch.columns.completed.title, 'Finished');
  assert.equal(change.boardPatch.columns.completed.isCompletion, true);
  assert.deepEqual(change.gameWrites, []);
});

t('a new list can be created as a completion list', () => {
  const change = saveColumnToBoardData(board(), { id: 'col-9', title: '100%', icon: 'star', isCompletion: true }, false);
  assert.equal(change.boardPatch.columns['col-9'].isCompletion, true);
  assert.deepEqual(change.boardPatch.columnOrder, ['backlog', 'playing', 'completed', 'col-9']);
});

t('several lists may be completion lists at once', () => {
  const model = applyChange(board(), saveColumnToBoardData(board(), { id: 'playing', title: 'Currently Playing', icon: 'gamepad', isCompletion: true }, true));
  assert.equal(isCompletionColumn(model, 'playing'), true);
  assert.equal(isCompletionColumn(model, 'completed'), true);
});

console.log('\napplyChange resolves the sentinels optimistically');

t('SERVER_NOW becomes a date and CLEAR_FIELD drops the key', () => {
  const model = board();
  const stamped = applyChange(model, moveGameOnBoardData(model, 'a', 'completed'));
  assert.ok(stamped.games.a.completedAt instanceof Date);
  const cleared = applyChange(stamped, moveGameOnBoardData(stamped, 'a', 'playing'));
  assert.ok(!('completedAt' in cleared.games.a));
});

console.log('\ncomputeUserStats');

t('counts, favourites and the average score', () => {
  const stats = computeUserStats(board());
  assert.equal(stats.total, 4);
  assert.equal(stats.completed, 2);
  assert.equal(stats.favorites, 1);
  assert.equal(stats.ratedCount, 3);
  assert.equal(Math.round(stats.averageRating * 100) / 100, 8.33);
  assert.deepEqual(stats.perColumn.map((column) => [column.id, column.count]), [['backlog', 1], ['playing', 1], ['completed', 2]]);
  assert.equal(stats.perColumn[2].isCompletion, true);
});

t('an empty board averages null rather than NaN', () => {
  const stats = computeUserStats({ ...board(), games: {} });
  assert.equal(stats.total, 0);
  assert.equal(stats.averageRating, null);
  assert.deepEqual(stats.platforms, []);
});

t('the rating histogram has one bucket per score', () => {
  const stats = computeUserStats(board());
  assert.equal(stats.ratingHistogram.length, 10);
  assert.equal(stats.ratingHistogram.find((bucket) => bucket.rating === 9).count, 2);
  assert.equal(stats.ratingHistogram.find((bucket) => bucket.rating === 7).count, 1);
  assert.equal(stats.ratingHistogram.find((bucket) => bucket.rating === 1).count, 0);
});

t('platforms are bucketed like the board filter, with Unknown for the rest', () => {
  const stats = computeUserStats(board());
  assert.deepEqual(stats.platforms.map((platform) => [platform.name, platform.count]), [['PC', 2], ['PlayStation', 1], ['Unknown', 1]]);
  assert.equal(stats.platforms[0].share, 0.5);
});

t('top rated is score first, then title', () => {
  const stats = computeUserStats(board());
  assert.deepEqual(stats.topRated.map((game) => game.id), ['d', 'a', 'c']);
});

t('recently completed is newest first and only from completion columns', () => {
  const stats = computeUserStats(board());
  assert.deepEqual(stats.recentlyCompleted.map((game) => game.id), ['d', 'c']);
  assert.equal(toMillis(stats.recentlyCompleted[0].completedAt), Date.parse('2026-09-01T00:00:00Z'));
});

t('a stale completedAt on a game outside a completion column is ignored', () => {
  const model = board();
  model.games.b.completedAt = new Date('2026-09-05T00:00:00Z');
  const stats = computeUserStats(model);
  assert.equal(stats.completed, 2);
  assert.deepEqual(stats.recentlyCompleted.map((game) => game.id), ['d', 'c']);
});

t('limits are configurable', () => {
  const stats = computeUserStats(board(), { topRatedLimit: 1, recentLimit: 1 });
  assert.equal(stats.topRated.length, 1);
  assert.equal(stats.recentlyCompleted.length, 1);
});

console.log('The "currently playing" list (S5/S6)');

const playingBoard = () => {
  const model = board();
  model.columns.playing = { ...model.columns.playing, isPlaying: true };
  return model;
};

t('the flagged list is found, and nothing is found without one', () => {
  assert.equal(playingColumnId(playingBoard()), 'playing');
  assert.equal(isPlayingColumn(playingBoard(), 'playing'), true);
  assert.equal(isPlayingColumn(playingBoard(), 'backlog'), false);
  assert.equal(playingColumnId(board()), null);
});

t('flagging a list takes the flag off the previous one', () => {
  const model = playingBoard();
  const change = saveColumnToBoardData(model, { id: 'backlog', title: 'To Play', icon: 'clock', isPlaying: true }, true);
  const columns = change.boardPatch.columns;
  assert.equal(columns.backlog.isPlaying, true);
  assert.equal('isPlaying' in columns.playing, false);
  assert.equal(playingColumnId(applyChange(model, change)), 'backlog');
});

t('a new list can claim the flag too', () => {
  const model = playingBoard();
  const change = saveColumnToBoardData(model, { id: 'now', title: 'Now', icon: 'zap', isPlaying: true }, false);
  assert.equal(change.boardPatch.columns.now.isPlaying, true);
  assert.equal('isPlaying' in change.boardPatch.columns.playing, false);
});

t('unflagging leaves no list flagged, and stamps no dates', () => {
  const model = playingBoard();
  const change = saveColumnToBoardData(model, { id: 'playing', title: 'Currently Playing', icon: 'gamepad', isPlaying: false }, true);
  assert.equal('isPlaying' in change.boardPatch.columns.playing, false);
  assert.deepEqual(change.gameWrites, []);
  assert.equal(playingColumnId(applyChange(model, change)), null);
});

t('a completion list keeps its own flag when another claims playing', () => {
  const model = playingBoard();
  const change = saveColumnToBoardData(model, { id: 'backlog', title: 'To Play', icon: 'clock', isPlaying: true }, true);
  assert.equal(change.boardPatch.columns.completed.isCompletion, true);
});

t('renaming a list keeps the flag it already had', () => {
  const model = playingBoard();
  const change = saveColumnToBoardData(model, { id: 'playing', title: 'En curso', icon: 'gamepad', isPlaying: true, isCompletion: false }, true);
  assert.equal(change.boardPatch.columns.playing.isPlaying, true);
  assert.equal(change.boardPatch.columns.playing.title, 'En curso');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
