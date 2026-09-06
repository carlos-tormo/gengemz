// Unit tests for the activity feed (S7). Pure: the merge reader takes an
// injected `fetchPage`, so nothing here needs Firestore or the emulator.
// Run from the repo root (gengemz/):
//   node --import ./tests/register-stubs.mjs tests/feed.test.mjs
import assert from 'node:assert/strict';
import {
  boardGameFromEvent,
  compareEvents,
  createFeedReader,
  groupFeedEvents,
  peekNewestMillis,
  timeAgo,
} from '../frontend/src/services/feedService.js';
import { computeFeedSources } from '../frontend/src/services/relationshipService.js';

let passed = 0; let failed = 0;
const t = (name, fn) => Promise.resolve()
  .then(fn)
  .then(() => { passed += 1; console.log('  ok   ', name); })
  .catch((e) => { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); });

const MINUTE = 60 * 1000;
const T0 = Date.UTC(2026, 8, 6, 12, 0, 0);

const event = (uid, index, at, type = 'game_added', extra = {}) => ({
  id: `${uid}-${index}`,
  uid,
  type,
  createdAt: at,
  game: { id: `g${index}`, title: `Game ${index}`, cover: '' },
  ...extra,
});

/*
 * A fake author: `events` newest-first, paged with an index cursor, counting
 * every query and every document it hands out so the read cost can be asserted
 * rather than assumed.
 */
const makeSource = (uid, count, { step = MINUTE, start = T0, type = 'game_added' } = {}) => ({
  uid,
  events: Array.from({ length: count }, (_, i) => event(uid, i, start - i * step, type)),
});

const fakeFetch = (sources, log = { queries: 0, reads: 0, byUid: {} }) => {
  const byUid = Object.fromEntries(sources.map((source) => [source.uid, source]));
  const fetchPage = async (uid, { cursor = null, pageSize }) => {
    const source = byUid[uid];
    if (!source) throw new Error(`unknown author ${uid}`);
    if (source.fail) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    const from = cursor || 0;
    const events = source.events.slice(from, from + pageSize);
    log.queries += 1;
    log.reads += events.length;
    log.byUid[uid] = (log.byUid[uid] || 0) + events.length;
    return { events, cursor: from + events.length };
  };
  return { fetchPage, log };
};

console.log('\nmerge ordering');

await t('events sort newest first, with the id as a stable tiebreaker', () => {
  const a = event('u1', 1, T0);
  const b = event('u1', 2, T0);
  const older = event('u2', 3, T0 - MINUTE);
  const sorted = [older, b, a].sort(compareEvents);
  // Same timestamp (one game write emits several events): the id decides, and
  // it decides the same way every time, so paging cannot interleave unstably.
  assert.deepEqual(sorted.map((e) => e.id), ['u1-2', 'u1-1', 'u2-3']);
});

await t('the id tiebreak is byte order, the way Firestore orders __name__', () => {
  // The SDK appends an implicit __name__ order in the same direction as the
  // createdAt order, and it is byte-ordered: every uppercase id sorts after
  // every lowercase one when descending. `localeCompare` interleaves the cases
  // instead, which would re-sort each page into an order the cursor does not
  // agree with and fragment a burst into extra cards.
  const ids = ['Zq1', 'aq1', 'Bq1', 'bq1', 'Aq1', 'zq1'];
  const sorted = ids.map((id) => ({ id, uid: 'u1', createdAt: T0 })).sort(compareEvents);
  assert.deepEqual(sorted.map((e) => e.id), ['zq1', 'bq1', 'aq1', 'Zq1', 'Bq1', 'Aq1']);
});

console.log('\nfan-out-on-read merge');

await t('two authors merge into one time-ordered page', async () => {
  const ana = makeSource('ana', 5, { start: T0 });
  const bea = makeSource('bea', 5, { start: T0 - 30 * 1000 });
  const { fetchPage } = fakeFetch([ana, bea]);
  const reader = createFeedReader({ uids: ['ana', 'bea'], fetchPage, perUserPageSize: 8 });
  const { events } = await reader.loadMore(10);
  assert.equal(events.length, 10);
  const times = events.map((e) => e.createdAt);
  assert.deepEqual(times, [...times].sort((x, y) => y - x));
  // Both authors are represented, alternating: ana at :00, bea 30s later.
  assert.deepEqual(events.slice(0, 4).map((e) => e.uid), ['ana', 'bea', 'ana', 'bea']);
});

await t('a page is over-read per author, and the reader says by how much', async () => {
  const sources = ['a', 'b', 'c'].map((uid) => makeSource(uid, 50));
  const { fetchPage, log } = fakeFetch(sources);
  const reader = createFeedReader({ uids: ['a', 'b', 'c'], fetchPage, perUserPageSize: 8 });
  const page = await reader.loadMore(30);
  assert.equal(page.events.length, 30);
  // 30 cards cost more than 30 reads: this is the number option (b) has to
  // beat, and it is reported rather than guessed.
  assert.ok(log.reads >= 30, `expected at least 30 reads, got ${log.reads}`);
  assert.equal(page.stats.reads, log.reads);
  assert.equal(page.stats.queries, log.queries);
});

await t('only the author whose buffer drained is re-queried', async () => {
  // One prolific author and one quiet one: the merge empties the prolific
  // buffer repeatedly and must not re-query the quiet author each time.
  const loud = makeSource('loud', 100, { start: T0, step: 1000 });
  const quiet = makeSource('quiet', 100, { start: T0 - 10 * 60 * 1000, step: 1000 });
  const { fetchPage, log } = fakeFetch([loud, quiet]);
  const reader = createFeedReader({ uids: ['loud', 'quiet'], fetchPage, perUserPageSize: 5 });
  await reader.loadMore(20);
  assert.equal(log.byUid.quiet, 5, 'the quiet author is read once');
  assert.ok(log.byUid.loud >= 20, 'the loud author is paged through');
});

await t('paging continues where the previous page stopped, with no repeats', async () => {
  const sources = ['a', 'b'].map((uid, i) => makeSource(uid, 20, { start: T0 - i * 500 }));
  const { fetchPage } = fakeFetch(sources);
  const reader = createFeedReader({ uids: ['a', 'b'], fetchPage, perUserPageSize: 4 });
  const first = await reader.loadMore(10);
  const second = await reader.loadMore(10);
  const ids = [...first.events, ...second.events].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'no event appears twice');
  const times = [...first.events, ...second.events].map((e) => e.createdAt);
  assert.deepEqual(times, [...times].sort((x, y) => y - x), 'the two pages stay in order');
});

await t('hasMore turns false once every author is exhausted', async () => {
  const { fetchPage } = fakeFetch([makeSource('a', 3), makeSource('b', 2)]);
  const reader = createFeedReader({ uids: ['a', 'b'], fetchPage, perUserPageSize: 8 });
  const page = await reader.loadMore(30);
  assert.equal(page.events.length, 5);
  assert.equal(page.hasMore, false);
});

await t('an author whose read is denied is dropped, not fatal', async () => {
  const ana = makeSource('ana', 4);
  const gone = { ...makeSource('gone', 4), fail: true };
  const errors = [];
  const { fetchPage } = fakeFetch([ana, gone]);
  const reader = createFeedReader({
    uids: ['ana', 'gone'],
    fetchPage,
    perUserPageSize: 8,
    onSourceError: (uid, error) => errors.push([uid, error.code]),
  });
  const page = await reader.loadMore(30);
  assert.deepEqual(page.events.map((e) => e.uid), ['ana', 'ana', 'ana', 'ana']);
  assert.deepEqual(errors, [['gone', 'permission-denied']]);
  // The refused query still cost a round trip, and it is exactly the author
  // option (b) would be judged on, so it has to appear in the count.
  assert.equal(page.stats.queries, 2);
});

await t('no authors is an empty feed, not an error', async () => {
  const reader = createFeedReader({ uids: [], fetchPage: async () => { throw new Error('never'); } });
  const page = await reader.loadMore(30);
  assert.deepEqual([page.events.length, page.hasMore], [0, false]);
});

await t('the focus poll costs one read per author', async () => {
  const { fetchPage, log } = fakeFetch([makeSource('a', 9), makeSource('b', 9, { start: T0 + MINUTE })]);
  const newest = await peekNewestMillis(['a', 'b'], fetchPage);
  assert.equal(newest, T0 + MINUTE);
  assert.equal(log.reads, 2);
});

console.log('\ncards');

await t('consecutive events of one type inside the window are one card', () => {
  const cards = groupFeedEvents([
    event('ana', 1, T0),
    event('ana', 2, T0 - MINUTE),
    event('ana', 3, T0 - 2 * MINUTE),
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].events.length, 3);
  assert.equal(cards[0].createdAt, T0, 'the card is timed by its newest event');
});

await t('the window is measured event to event, not from the first', () => {
  // Four additions six minutes apart: 18 minutes end to end, but never more
  // than the window between two consecutive ones, so it is still one burst.
  const cards = groupFeedEvents([0, 6, 12, 18].map((m, i) => event('ana', i, T0 - m * MINUTE)));
  assert.equal(cards.length, 1);
});

await t('a gap wider than the window splits the card', () => {
  const cards = groupFeedEvents([
    event('ana', 1, T0),
    event('ana', 2, T0 - 11 * MINUTE),
  ]);
  assert.equal(cards.length, 2);
});

await t('a different type splits the card even inside the window', () => {
  // "Ana added 4 games" only works when the four are additions; a card that
  // mixes types has no sentence to render.
  const cards = groupFeedEvents([
    event('ana', 1, T0, 'game_added'),
    event('ana', 2, T0 - 1000, 'game_rated'),
  ]);
  assert.deepEqual(cards.map((c) => c.type), ['game_added', 'game_rated']);
});

await t('another author always starts a new card', () => {
  const cards = groupFeedEvents([
    event('ana', 1, T0),
    event('bea', 1, T0 - 1000),
    event('ana', 2, T0 - 2000),
  ]);
  assert.deepEqual(cards.map((c) => c.uid), ['ana', 'bea', 'ana']);
});

console.log('\ncard actions');

await t('a card builds the board game from the event summary only', () => {
  const game = boardGameFromEvent({
    game: { id: 'rawg-3498', title: 'GTA V', cover: 'c.jpg', rawgId: '3498' },
  });
  assert.deepEqual(game, {
    id: 'rawg-3498',
    title: 'GTA V',
    cover: 'c.jpg',
    coverIndex: 0,
    rating: 0,
    isFavorite: false,
    rawgId: '3498',
    externalSource: 'rawg',
  });
});

await t('an event without a game (a playlist) has nothing to add', () => {
  assert.equal(boardGameFromEvent({ playlist: { id: 'p1', name: 'Cosy' } }), null);
});

await t('a non-RAWG game keeps no external source', () => {
  const game = boardGameFromEvent({ game: { id: 'game-1', title: 'Homebrew', cover: '' } });
  assert.equal('rawgId' in game, false);
  assert.equal('externalSource' in game, false);
});

await t('relative times read as the card shows them', () => {
  assert.equal(timeAgo(T0, T0 + 30 * 1000), 'just now');
  assert.equal(timeAgo(T0, T0 + 12 * MINUTE), '12m');
  assert.equal(timeAgo(T0, T0 + 5 * 60 * MINUTE), '5h');
  assert.equal(timeAgo(T0, T0 + 3 * 24 * 60 * MINUTE), '3d');
  assert.equal(timeAgo(null), '');
});

console.log('\nfeed authors');

const following = (uid, status = 'following') => ({ uid, displayName: uid, status });

await t('accepted follows are the feed authors', () => {
  assert.deepEqual(computeFeedSources({
    following: { u2: following('u2'), u1: following('u1') },
  }), ['u1', 'u2']);
});

await t('a one-way follow is a feed author even without a follow back', () => {
  // The rule asks whether I follow them (canViewActivity), not the reverse:
  // waiting for a mutual follow would empty the feed for no reason.
  assert.deepEqual(computeFeedSources({ following: { u1: following('u1') }, followers: {} }), ['u1']);
});

await t('a pending request is not a feed author', () => {
  assert.deepEqual(computeFeedSources({ following: { u1: following('u1', 'pending') } }), []);
});

await t('blocking removes an author immediately, before the listeners agree', () => {
  assert.deepEqual(computeFeedSources({
    following: { u1: following('u1'), u2: following('u2') },
    blocked: { u1: { uid: 'u1' } },
  }), ['u2']);
});

await t('no relationships at all is an empty author list', () => {
  assert.deepEqual(computeFeedSources(), []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
