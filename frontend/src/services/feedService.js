import {
  collection,
  getDocs,
  limit as queryLimit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import { APP_ID } from '../config/constants';
import { db } from '../config/firebase';
import { toMillis } from './boardService';

/*
 * Activity feed (S7), fan-out-on-read.
 *
 * **Why one query per author.** Decision 11: a `list` is authorised against the
 * query, not per document, so a rule whose answer depends on a follow
 * relationship denies the whole query. `collectionGroup('activity')` can
 * therefore never be authorised for a feed, and option (a) of the task is the
 * only correct one without new infrastructure: read
 * `artifacts/{APP_ID}/users/{uid}/activity` once per followed account, ordered
 * `createdAt desc`, and merge the pages client-side. The shipped rule
 * (`allow read: if isOwner(userId) || canViewActivity(appId, userId)`) allows
 * exactly this shape and nothing else.
 *
 * **Cost.** A page is not `pageSize` reads: it is `PER_USER_PAGE_SIZE` reads
 * for every author whose buffer the merge drains, plus one refill each time a
 * buffer empties mid-page. The reader reports what it actually read
 * (`stats.reads` / `stats.queries`) so option (b), the fan-out-on-write inbox,
 * can be judged against a real number rather than a guess.
 *
 * Everything above `fetchUserActivityPage` is pure — `fetchPage` is injected —
 * so `tests/feed.test.mjs` exercises the merge, the paging and the grouping
 * without an emulator.
 */

export const FEED_PAGE_SIZE = 30;
/* Kept small on purpose: it is the unit of over-reading per author. */
export const PER_USER_PAGE_SIZE = 8;
/* Same window S5 uses to debounce ratings; a burst of edits is one decision. */
export const GROUP_WINDOW_MS = 10 * 60 * 1000;

const millisOf = (event) => toMillis(event?.createdAt) ?? 0;

/* Newest first, with the document id as the tiebreaker: several events from one
 * game write share a server timestamp, so a bare time sort is not a total
 * order and the merge would otherwise interleave two authors unstably.
 *
 * The id comparison is a plain byte comparison, **not** `localeCompare`: the
 * SDK appends an implicit `__name__` order in the same direction as the
 * `createdAt` order, and that one is byte-ordered (every uppercase id before
 * every lowercase one). ICU collation interleaves the two cases instead, so a
 * locale-aware compare would re-sort each page into an order Firestore's own
 * cursor does not agree with, and a burst would fragment into extra cards. */
const compareIds = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));

export const compareEvents = (a, b) => (
  millisOf(b) - millisOf(a) || compareIds(String(b.id), String(a.id))
);

/* ---------- the merge reader ---------- */

/**
 * A paging k-way merge over one activity query per author.
 *
 * `fetchPage(uid, { cursor, pageSize })` must resolve to
 * `{ events, cursor }` — events newest-first, `cursor` an opaque value to
 * continue after (the last `DocumentSnapshot` in the Firestore
 * implementation; several events share a `createdAt`, so a value cursor would
 * skip their siblings).
 *
 * An author whose page is refused (unfollowed or gone private between the
 * listing and the read) is dropped from the merge instead of failing the page.
 */
export const createFeedReader = ({
  uids = [],
  fetchPage,
  perUserPageSize = PER_USER_PAGE_SIZE,
  onSourceError = null,
} = {}) => {
  const sources = uids.map((uid) => ({ uid, buffer: [], cursor: null, done: false }));
  const stats = { queries: 0, reads: 0 };

  const refill = async (source) => {
    // Counted before the await: a query that is refused still cost a round
    // trip, and it is exactly the author option (b) would be judged on.
    stats.queries += 1;
    try {
      const page = await fetchPage(source.uid, { cursor: source.cursor, pageSize: perUserPageSize });
      const events = page?.events || [];
      stats.reads += events.length;
      source.buffer = events.slice().sort(compareEvents);
      if (page?.cursor) source.cursor = page.cursor;
      // A short page is the last page: Firestore returned everything left.
      if (events.length < perUserPageSize) source.done = true;
    } catch (error) {
      source.done = true;
      source.buffer = [];
      if (onSourceError) onSourceError(source.uid, error);
      else console.error('Feed page failed', source.uid, error);
    }
  };

  // Invariant kept by every path below: a source that is not `done` always has
  // a non-empty buffer, so the newest head across sources is the global newest.
  const fillEmpty = () => Promise.all(
    sources.filter((source) => !source.done && !source.buffer.length).map(refill),
  );

  const hasMore = () => sources.some((source) => source.buffer.length || !source.done);

  const loadMore = async (pageSize = FEED_PAGE_SIZE) => {
    await fillEmpty();
    const events = [];
    while (events.length < pageSize) {
      let best = null;
      for (const source of sources) {
        if (!source.buffer.length) continue;
        if (!best || compareEvents(source.buffer[0], best.buffer[0]) < 0) best = source;
      }
      if (!best) break;
      events.push(best.buffer.shift());
      if (!best.buffer.length && !best.done) await refill(best);
    }
    return { events, hasMore: hasMore(), stats: { ...stats } };
  };

  return { loadMore, hasMore, stats: () => ({ ...stats }) };
};

/**
 * Cheapest possible "is there anything new" check: the newest event of each
 * author, one read each. Used on window focus instead of a listener (the task
 * asked for polling, not real time). Authors that refuse the read are ignored.
 */
export const peekNewestMillis = async (uids, fetchPage) => {
  const pages = await Promise.all((uids || []).map(async (uid) => {
    try {
      const page = await fetchPage(uid, { cursor: null, pageSize: 1 });
      return page?.events?.[0] || null;
    } catch {
      return null;
    }
  }));
  return pages.reduce((newest, event) => Math.max(newest, event ? millisOf(event) : 0), 0);
};

/* ---------- cards ---------- */

/**
 * Consecutive events by the same author *of the same type* inside the window
 * become one card ("Ana added 4 games").
 *
 * The task said "by the same user"; the type is part of the key because a card
 * that mixes types has no sentence to render — "Ana added 4 games" only works
 * when the four are additions. Two different types stay two cards, which is
 * also what makes a guest-board merge (one burst of `game_added`) read as a
 * single line.
 */
export const groupFeedEvents = (events = [], { windowMs = GROUP_WINDOW_MS } = {}) => {
  const cards = [];
  events.forEach((event) => {
    const last = cards[cards.length - 1];
    const at = millisOf(event);
    if (last
      && last.uid === event.uid
      && last.type === event.type
      && last.oldestAt - at <= windowMs) {
      last.events.push(event);
      last.oldestAt = at;
      return;
    }
    cards.push({
      id: `${event.uid}:${event.id}`,
      uid: event.uid,
      type: event.type,
      createdAt: event.createdAt,
      newestAt: at,
      oldestAt: at,
      events: [event],
    });
  });
  return cards;
};

/**
 * The board game a feed card's "Add to my backlog" writes. Only what the event
 * carries: the summary has no platform, genre or year, and inventing them is
 * worse than leaving them empty (`addGameToBoardData` fills the rest).
 */
export const boardGameFromEvent = (event) => {
  const game = event?.game;
  if (!game?.id) return null;
  return {
    id: String(game.id),
    title: game.title || 'Untitled',
    cover: game.cover || '',
    coverIndex: 0,
    rating: 0,
    isFavorite: false,
    ...(game.rawgId ? { rawgId: String(game.rawgId), externalSource: 'rawg' } : {}),
  };
};

const UNITS = [
  [60 * 1000, 'm', 60],
  [60 * 60 * 1000, 'h', 24],
  [24 * 60 * 60 * 1000, 'd', 7],
];

/** "just now" / "12m" / "5h" / "3d" / a date once it stops being relative. */
export const timeAgo = (value, now = Date.now()) => {
  const at = toMillis(value);
  if (!at) return '';
  const elapsed = Math.max(0, now - at);
  if (elapsed < UNITS[0][0]) return 'just now';
  for (const [size, suffix, limit] of UNITS) {
    const count = Math.floor(elapsed / size);
    if (count < limit) return `${count}${suffix}`;
  }
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/* ---------- Firestore ---------- */

const activityCollection = (uid) => collection(db, 'artifacts', APP_ID, 'users', uid, 'activity');

/**
 * One page of one author's activity. The cursor is the last `DocumentSnapshot`
 * rather than its `createdAt`: `startAfter(timestamp)` on a single order-by
 * field skips every sibling sharing that timestamp, and S5 stamps all the
 * events of one game write with the same server time.
 *
 * Runs on the automatic single-field index — no composite index is needed, and
 * none was added for the feed.
 */
export const fetchUserActivityPage = async (uid, { cursor = null, pageSize = PER_USER_PAGE_SIZE } = {}) => {
  const constraints = [orderBy('createdAt', 'desc')];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(queryLimit(pageSize));

  const snapshot = await getDocs(query(activityCollection(uid), ...constraints));
  const events = [];
  let last = null;
  snapshot.forEach((docSnap) => {
    // `uid` is taken from the path, not the document: the path is what the
    // rules authorised, and it is what the card links to.
    events.push({ ...docSnap.data(), id: docSnap.id, uid });
    last = docSnap;
  });
  return { events, cursor: last || cursor };
};

/** The reader the app uses: `fetchPage` bound to Firestore. */
export const createFirestoreFeedReader = (uids, options = {}) => createFeedReader({
  uids,
  fetchPage: fetchUserActivityPage,
  ...options,
});
