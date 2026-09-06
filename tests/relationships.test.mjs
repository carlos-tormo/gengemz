// Unit tests for the friends intersection (S6). Pure function, no emulator.
// Run from the repo root (gengemz/):
//   node --import ./tests/register-stubs.mjs tests/relationships.test.mjs
import assert from 'node:assert/strict';
import { computeFriends } from '../frontend/src/services/relationshipService.js';
import { currentlyPlaying } from '../frontend/src/services/boardService.js';

let passed = 0; let failed = 0;
const t = (name, fn) => {
  try { fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

const followingEntry = (uid, name, status = 'following') => ({
  uid, displayName: name, photoURL: `${uid}.png`, status,
});
const followerEntry = (uid, name = '') => ({ uid, displayName: name, photoURL: '', status: 'following' });

console.log('\nfriends = mutual follow');

t('mutual follow is a friend', () => {
  const friends = computeFriends({
    following: { u1: followingEntry('u1', 'Ana') },
    followers: { u1: followerEntry('u1', 'Ana') },
  });
  assert.deepEqual(friends.map((f) => f.uid), ['u1']);
  assert.equal(friends[0].displayName, 'Ana');
  assert.equal(friends[0].photoURL, 'u1.png');
});

t('following someone who does not follow back is not a friend', () => {
  assert.deepEqual(computeFriends({
    following: { u1: followingEntry('u1', 'Ana') },
    followers: {},
  }), []);
});

t('a follower I do not follow is not a friend', () => {
  assert.deepEqual(computeFriends({
    following: {},
    followers: { u1: followerEntry('u1', 'Ana') },
  }), []);
});

t('a pending request to an invite-only profile is not a friend', () => {
  // The requester can already be in their followers list from an earlier
  // follow-unfollow-refollow cycle; status is what decides.
  assert.deepEqual(computeFriends({
    following: { u1: followingEntry('u1', 'Ana', 'pending') },
    followers: { u1: followerEntry('u1', 'Ana') },
  }), []);
});

t('a blocked user is never a friend, even mid-block', () => {
  // block() deletes both sides, but the four listeners deliver separately.
  assert.deepEqual(computeFriends({
    following: { u1: followingEntry('u1', 'Ana') },
    followers: { u1: followerEntry('u1', 'Ana') },
    blocked: { u1: { uid: 'u1' } },
  }), []);
});

t('falls back to the followers entry when the name is missing, then to Player', () => {
  const [first, second] = computeFriends({
    following: {
      u1: { uid: 'u1', status: 'following' },
      u2: { uid: 'u2', status: 'following' },
    },
    followers: { u1: followerEntry('u1', 'Zoe'), u2: followerEntry('u2') },
  });
  assert.equal(first.displayName, 'Player');  // u2: no name on either side
  assert.equal(second.displayName, 'Zoe');    // u1: name only on the followers entry
});

t('sorted by display name', () => {
  const friends = computeFriends({
    following: {
      u1: followingEntry('u1', 'Zoe'),
      u2: followingEntry('u2', 'Ana'),
      u3: followingEntry('u3', 'Mateo'),
    },
    followers: { u1: followerEntry('u1'), u2: followerEntry('u2'), u3: followerEntry('u3') },
  });
  assert.deepEqual(friends.map((f) => f.displayName), ['Ana', 'Mateo', 'Zoe']);
});

t('empty and missing relationship maps are safe', () => {
  assert.deepEqual(computeFriends(), []);
  assert.deepEqual(computeFriends({}), []);
  assert.deepEqual(computeFriends({ following: {}, followers: {} }), []);
});

t('an entry without a uid is skipped', () => {
  assert.deepEqual(computeFriends({
    following: { u1: { displayName: 'Ghost', status: 'following' } },
    followers: { u1: followerEntry('u1') },
  }), []);
});

t('a followers entry without a status still counts', () => {
  // Only `following` carries the pending/accepted distinction; the followers
  // entry is the other side's record and S6 must not start requiring a status
  // on it.
  const friends = computeFriends({
    following: { u1: followingEntry('u1', 'Ana') },
    followers: { u1: { uid: 'u1', displayName: 'Ana' } },
  });
  assert.deepEqual(friends.map((f) => f.uid), ['u1']);
});

console.log('\ncurrently playing = the isPlaying column, never the id');

const boardWith = (columns, columnOrder, games = {}, schemaVersion = 2) => ({
  schemaVersion, columns, columnOrder, games,
});

t('picks the flagged column even when it is renamed and not called playing', () => {
  const plan = currentlyPlaying(boardWith({
    backlog: { id: 'backlog', title: 'To Play' },
    now: { id: 'now', title: 'En curso', isPlaying: true },
  }, ['backlog', 'now']));
  assert.deepEqual(plan, { status: 'subscribe', columnId: 'now', columnTitle: 'En curso' });
});

t('ignores a column called playing that is not flagged', () => {
  const plan = currentlyPlaying(boardWith({
    playing: { id: 'playing', title: 'Currently Playing' },
    done: { id: 'done', title: 'Victory Road', isCompletion: true },
  }, ['playing', 'done']));
  assert.equal(plan.status, 'no-playing-column');
});

t('a board with no columns at all has no playing column', () => {
  assert.equal(currentlyPlaying(boardWith({}, [])).status, 'no-playing-column');
});

t('no board is distinct from no playing column', () => {
  assert.equal(currentlyPlaying(null).status, 'no-board');
});

t('a schema-1 board resolves the first game inline, no listener needed', () => {
  const plan = currentlyPlaying(boardWith({
    now: { id: 'now', title: 'Currently Playing', isPlaying: true },
  }, ['now'], {
    b: { id: 'b', title: 'Tunic', columnId: 'now', position: 1 },
    a: { id: 'a', title: 'Hollow Knight', columnId: 'now', position: 0 },
    c: { id: 'c', title: 'Celeste', columnId: 'other', position: 0 },
  }, 1));
  assert.equal(plan.status, 'ready');
  assert.equal(plan.game.title, 'Hollow Knight');
});

t('a schema-1 board with an empty playing column reports no game', () => {
  const plan = currentlyPlaying(boardWith({
    now: { id: 'now', title: 'Currently Playing', isPlaying: true },
  }, ['now'], {}, 1));
  assert.deepEqual([plan.status, plan.game], ['ready', null]);
});


console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
