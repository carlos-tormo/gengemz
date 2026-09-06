import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FEED_PAGE_SIZE,
  createFirestoreFeedReader,
  fetchUserActivityPage,
  groupFeedEvents,
  peekNewestMillis,
} from '../services/feedService';
import { toMillis } from '../services/boardService';
import { getPublicProfile } from '../services/profileService';

/*
 * Owns one feed session (S7).
 *
 * The reader is rebuilt whenever the set of authors changes, which is what
 * makes an unfollow or a block take effect immediately: `feedSources` comes
 * from the relationship listeners, so the removed author's events are gone on
 * the next render without waiting for anything server-side.
 *
 * No listener is attached (the task asked for polling): a focus check reads the
 * newest event of each author — one document each — and, when it is newer than
 * what is on screen, offers a refresh instead of moving the page under the
 * reader's cursor.
 */

const FOCUS_POLL_MS = 60 * 1000;

/*
 * The cumulative cost of the session, per page, at debug level. This is the
 * number that decides whether the fan-out-on-write inbox (option (b) of S7) is
 * worth building, and the only way to read it against real accounts rather
 * than the fixtures in tests/feed.test.mjs.
 */
const reportCost = (cards, stats) => console.debug(
  '[feed] page: %d cards, %d documents read in %d queries (session total)',
  cards, stats.reads, stats.queries,
);

const initialState = {
  events: [],
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  error: null,
};

/*
 * `enabled` is what keeps the feed from costing anything on the board: the
 * session is built when /feed is on screen and torn down when it is not, so
 * navigating elsewhere never leaves queries running.
 */
const useFeed = (user, sourceUids = [], { includeOwn = false, pageSize = FEED_PAGE_SIZE, enabled = true } = {}) => {
  // Sorted and joined so a re-render with an equal array does not restart the
  // session; `feedSources` is already sorted, this only makes it explicit.
  const sourcesKey = useMemo(() => [...sourceUids].sort().join(','), [sourceUids]);
  const ownUid = user && !user.isAnonymous ? user.uid : null;

  const authors = useMemo(() => {
    const uids = sourcesKey ? sourcesKey.split(',') : [];
    if (includeOwn && ownUid && !uids.includes(ownUid)) return [...uids, ownUid];
    return uids;
  }, [sourcesKey, includeOwn, ownUid]);
  const authorsKey = authors.join(',');

  const [state, setState] = useState(initialState);
  const [profiles, setProfiles] = useState({});
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const readerRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const sessionRef = useRef(0);
  const newestRef = useRef(0);
  const lastPolledRef = useRef(0);
  const profilesRef = useRef({});

  /* One `public_profiles` read per distinct author ever shown. Names and
   * avatars are deliberately not copied onto the event (deferred D4), so a
   * rename never leaves a stale card. */
  const ensureProfiles = useCallback(async (uids) => {
    const missing = uids.filter((uid) => uid && !(uid in profilesRef.current));
    if (!missing.length) return;
    // Claimed up front so two pages don't read the same profile twice; a read
    // that fails releases its claim again, so the next page retries it instead
    // of rendering that author as "Player" for the life of the tab.
    missing.forEach((uid) => { profilesRef.current[uid] = null; });
    const loaded = await Promise.all(missing.map(async (uid) => {
      try {
        return [uid, await getPublicProfile(uid)];
      } catch (error) {
        console.error('Feed profile read failed', uid, error);
        delete profilesRef.current[uid];
        return null;
      }
    }));
    const next = Object.fromEntries(loaded.filter(Boolean));
    Object.assign(profilesRef.current, next);
    setProfiles((prev) => ({ ...prev, ...next }));
  }, []);

  // A new session per author set: a new reader, cursors reset, page one.
  useEffect(() => {
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    loadingMoreRef.current = false;
    const current = authorsKey ? authorsKey.split(',') : [];

    setHasNewActivity(false);
    newestRef.current = 0;
    lastPolledRef.current = Date.now();

    const nothingToRead = !user || user.isAnonymous || !current.length;
    if (!enabled || nothingToRead) {
      readerRef.current = null;
      // While disabled with authors to read, the resting state is *loading*:
      // the page mounts and paints before this effect runs, and an "empty
      // feed" flashing for one frame on every visit is worse than a spinner.
      setState({ ...initialState, isLoading: !nothingToRead });
      return undefined;
    }

    const reader = createFirestoreFeedReader(current);
    readerRef.current = reader;
    setState({ ...initialState, isLoading: true });

    reader.loadMore(pageSize)
      .then(({ events, hasMore, stats }) => {
        if (sessionRef.current !== session) return;
        newestRef.current = events.length ? (toMillis(events[0].createdAt) ?? 0) : 0;
        reportCost(events.length, stats);
        setState({ events, isLoading: false, isLoadingMore: false, hasMore, error: null });
        ensureProfiles([...new Set(events.map((event) => event.uid))]);
      })
      .catch((error) => {
        if (sessionRef.current !== session) return;
        console.error('Feed load failed', error);
        setState({ ...initialState, isLoading: false, error });
      });

    return () => { if (sessionRef.current === session) readerRef.current = null; };
  }, [authorsKey, user, pageSize, enabled, ensureProfiles, reloadToken]);

  const loadMore = useCallback(async () => {
    const reader = readerRef.current;
    const session = sessionRef.current;
    // A ref, not the state flag: two overlapping calls would refill the same
    // buffer from the same cursor and re-emit events the first call shifted
    // out. Not reachable through the button, but an infinite scroll would.
    if (!reader || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setState((prev) => (prev.isLoadingMore ? prev : { ...prev, isLoadingMore: true }));
    try {
      const { events, hasMore, stats } = await reader.loadMore(pageSize);
      if (sessionRef.current !== session) return;
      reportCost(events.length, stats);
      setState((prev) => ({
        ...prev,
        events: [...prev.events, ...events],
        isLoadingMore: false,
        hasMore,
      }));
      ensureProfiles([...new Set(events.map((event) => event.uid))]);
    } catch (error) {
      if (sessionRef.current !== session) return;
      console.error('Feed page failed', error);
      setState((prev) => ({ ...prev, isLoadingMore: false, error }));
    } finally {
      loadingMoreRef.current = false;
    }
  }, [pageSize, ensureProfiles]);

  const refresh = useCallback(() => {
    setHasNewActivity(false);
    setReloadToken((token) => token + 1);
  }, []);

  // Poll on focus, at most once a minute, one read per author.
  useEffect(() => {
    if (!enabled || !authorsKey || !user || user.isAnonymous) return undefined;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastPolledRef.current < FOCUS_POLL_MS) return;
      lastPolledRef.current = now;
      const session = sessionRef.current;
      const newest = await peekNewestMillis(authorsKey.split(','), fetchUserActivityPage);
      if (sessionRef.current !== session) return;
      if (newest > newestRef.current) setHasNewActivity(true);
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [authorsKey, user, enabled]);

  const cards = useMemo(() => groupFeedEvents(state.events), [state.events]);

  return {
    cards,
    profiles,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore: state.hasMore,
    error: state.error,
    hasNewActivity,
    authorCount: authors.length,
    loadMore,
    refresh,
  };
};

export default useFeed;
