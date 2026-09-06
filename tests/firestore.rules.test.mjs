// Firestore security-rules tests for gengemz.
// Run from the repo root (gengemz/), with firebase-tools, firebase and
// @firebase/rules-unit-testing installed:
//   npx firebase emulators:exec --only firestore --project rules-test "node tests/firestore.rules.test.mjs"
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query,
  setDoc, deleteDoc, serverTimestamp, startAfter, where, writeBatch,
} from 'firebase/firestore';

const APP = 'gengemz-prod';
const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { rules: readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const P = (db, ...seg) => doc(db, 'artifacts', APP, ...seg);
const boardRef = (db, uid) => P(db, 'users', uid, 'data', 'board');
const rel = (db, owner, type, other) => P(db, 'relationships', owner, type, other);
const gameRef = (db, uid, gameId) => P(db, 'users', uid, 'games', gameId);
const gamesCol = (db, uid) => collection(db, 'artifacts', APP, 'users', uid, 'games');
const activityRef = (db, uid, eventId) => P(db, 'users', uid, 'activity', eventId);
const activityCol = (db, uid) => collection(db, 'artifacts', APP, 'users', uid, 'activity');

// Seed: alice public, bob invite_only, carol private. Each has a board.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [uid, privacy] of [['alice', 'public'], ['bob', 'invite_only'], ['carol', 'private']]) {
    await setDoc(P(db, 'public_profiles', uid), { uid, privacy, displayName: uid });
    await setDoc(boardRef(db, uid), { columns: { backlog: { id: 'backlog', title: 'To Play', icon: 'clock' } }, columnOrder: ['backlog'], schemaVersion: 2, updatedAt: new Date() });
    await setDoc(gameRef(db, uid, 'g1'), { id: 'g1', title: 'Seed', columnId: 'backlog', position: 0, rating: 0, isFavorite: false, addedAt: new Date(), updatedAt: new Date() });
  }
  // legacy (schema 1) board for zoe, used by the transitional board tests
  await setDoc(P(db, 'public_profiles', 'zoe'), { uid: 'zoe', privacy: 'private', displayName: 'zoe' });
  await setDoc(boardRef(db, 'zoe'), { games: {}, columns: {}, columnOrder: [] });
  // alice has blocked mallory
  await setDoc(rel(db, 'alice', 'blocked', 'mallory'), { uid: 'mallory', blockedAt: new Date() });
});

const anon = env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();

let passed = 0, failed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ', name); }
  catch (e) { failed++; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

console.log('Board reads');
await t('unauthenticated cannot read public board', () => assertFails(getDoc(boardRef(anon, 'alice'))));
await t('unauthenticated cannot read invite_only board', () => assertFails(getDoc(boardRef(anon, 'bob'))));
await t('signed-in stranger can read public board', () => assertSucceeds(getDoc(boardRef(as('dave'), 'alice'))));
await t('signed-in stranger cannot read invite_only board', () => assertFails(getDoc(boardRef(as('dave'), 'bob'))));
await t('signed-in stranger cannot read private board', () => assertFails(getDoc(boardRef(as('dave'), 'carol'))));
await t('blocked user cannot read public board', () => assertFails(getDoc(boardRef(as('mallory'), 'alice'))));
await t('owner reads own private board', () => assertSucceeds(getDoc(boardRef(as('carol'), 'carol'))));

console.log('Follow request flow (dave -> bob, invite_only)');
const dave = as('dave'), bob = as('bob');
await t('dave writes pending following entry', () => assertSucceeds(setDoc(rel(dave, 'dave', 'following', 'bob'), {
  uid: 'bob', displayName: 'bob', photoURL: '', status: 'pending', updatedAt: serverTimestamp() })));
await t('dave cannot self-mark following=following on invite_only', () => assertFails(setDoc(rel(dave, 'dave', 'following', 'bob'), {
  uid: 'bob', displayName: 'bob', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('dave writes request to bob', () => assertSucceeds(setDoc(rel(dave, 'bob', 'requests', 'dave'), {
  uid: 'dave', displayName: 'dave', photoURL: '', status: 'pending', createdAt: serverTimestamp() })));
await t('dave cannot add himself to bob followers', () => assertFails(setDoc(rel(dave, 'bob', 'followers', 'dave'), {
  uid: 'dave', displayName: 'dave', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('pending request does not grant board access', () => assertFails(getDoc(boardRef(dave, 'bob'))));
await t('eve cannot accept on bob behalf', () => assertFails(setDoc(rel(as('eve'), 'bob', 'followers', 'dave'), {
  uid: 'dave', displayName: 'dave', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('bob cannot accept a request that does not exist (frank)', () => assertFails(setDoc(rel(bob, 'bob', 'followers', 'frank'), {
  uid: 'frank', displayName: 'frank', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('bob accepts via batch', async () => {
  const b = writeBatch(bob);
  b.set(rel(bob, 'bob', 'followers', 'dave'), { uid: 'dave', displayName: 'dave', photoURL: '', status: 'following', updatedAt: serverTimestamp() }, { merge: true });
  b.set(rel(bob, 'dave', 'following', 'bob'), { status: 'following', updatedAt: serverTimestamp() }, { merge: true });
  b.delete(rel(bob, 'bob', 'requests', 'dave'));
  await assertSucceeds(b.commit());
});
await t('bob accepts even when requester following entry is missing (create path)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(rel(db, 'bob', 'requests', 'heidi'), { uid: 'heidi', status: 'pending', createdAt: new Date() });
  });
  const b = writeBatch(bob);
  b.set(rel(bob, 'bob', 'followers', 'heidi'), { uid: 'heidi', displayName: 'heidi', photoURL: '', status: 'following', updatedAt: serverTimestamp() }, { merge: true });
  b.set(rel(bob, 'heidi', 'following', 'bob'), { uid: 'bob', displayName: 'bob', photoURL: '', status: 'following', updatedAt: serverTimestamp() }, { merge: true });
  b.delete(rel(bob, 'bob', 'requests', 'heidi'));
  await assertSucceeds(b.commit());
});
await t('accepted follower reads invite_only board', () => assertSucceeds(getDoc(boardRef(dave, 'bob'))));
await t('bob cannot flip an already-accepted entry again (no request)', () => assertFails(setDoc(rel(bob, 'dave', 'following', 'bob'), {
  status: 'following', updatedAt: serverTimestamp() }, { merge: true })));
await t('bob revokes by deleting followers entry', () => assertSucceeds(deleteDoc(rel(bob, 'bob', 'followers', 'dave'))));
await t('revoked follower loses board access', () => assertFails(getDoc(boardRef(dave, 'bob'))));

console.log('Decline flow (grace -> bob)');
const grace = as('grace');
await setDoc(rel(grace, 'grace', 'following', 'bob'), { uid: 'bob', displayName: 'bob', photoURL: '', status: 'pending', updatedAt: serverTimestamp() });
await setDoc(rel(grace, 'bob', 'requests', 'grace'), { uid: 'grace', displayName: 'grace', photoURL: '', status: 'pending', createdAt: serverTimestamp() });
await t('bob deletes request', () => assertSucceeds(deleteDoc(rel(bob, 'bob', 'requests', 'grace'))));
await t('bob deletes grace following entry', () => assertSucceeds(deleteDoc(rel(bob, 'grace', 'following', 'bob'))));

console.log('Blocking');
const mallory = as('mallory');
await t('blocked user cannot follow public alice', () => assertFails(setDoc(rel(mallory, 'mallory', 'following', 'alice'), {
  uid: 'alice', displayName: 'alice', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('blocked user cannot add self to alice followers', () => assertFails(setDoc(rel(mallory, 'alice', 'followers', 'mallory'), {
  uid: 'mallory', displayName: 'm', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('unblocked stranger can follow public alice', () => assertSucceeds(setDoc(rel(dave, 'dave', 'following', 'alice'), {
  uid: 'alice', displayName: 'alice', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));
await t('unblocked stranger can add self to alice followers', () => assertSucceeds(setDoc(rel(dave, 'alice', 'followers', 'dave'), {
  uid: 'dave', displayName: 'dave', photoURL: '', status: 'following', updatedAt: serverTimestamp() })));

console.log('Board document (schema 2)');
const alice = as('alice');
const v2Board = () => ({ columns: { backlog: { id: 'backlog', title: 'To Play', icon: 'clock' } }, columnOrder: ['backlog'], schemaVersion: 2, updatedAt: serverTimestamp() });
await t('owner writes v2 board', () => assertSucceeds(setDoc(boardRef(alice, 'alice'), v2Board())));
await t('v2 board rejects games key', () => assertFails(setDoc(boardRef(alice, 'alice'), { ...v2Board(), games: {} })));
await t('v2 board rejects missing updatedAt', () => assertFails(setDoc(boardRef(alice, 'alice'), { ...v2Board(), updatedAt: new Date(2020, 1, 1) })));
await t('v2 board rejects wrong schemaVersion', () => assertFails(setDoc(boardRef(alice, 'alice'), { ...v2Board(), schemaVersion: 3 })));
await t('v2 board cannot be downgraded to legacy shape', () => assertFails(setDoc(boardRef(alice, 'alice'), { games: {}, columns: {}, columnOrder: [] })));
await t('legacy board still accepts legacy shape (until S3)', () => assertSucceeds(setDoc(boardRef(as('zoe'), 'zoe'), { games: {}, columns: {}, columnOrder: [] })));
await t('legacy board can upgrade to v2', () => assertSucceeds(setDoc(boardRef(as('zoe'), 'zoe'), v2Board())));
await t('non-owner cannot write board', () => assertFails(setDoc(boardRef(dave, 'alice'), v2Board())));

console.log('Game documents: owner CRUD');
const game = (id, extra = {}) => ({
  id, title: 'Hollow Knight', cover: 'https://x/y.jpg', coverIndex: 0, rawgId: '9767', rawgSlug: 'hollow-knight',
  externalSource: 'rawg', platform: 'PC', genre: 'Indie', year: '2017', columnId: 'backlog', position: 0.5,
  rating: 0, isFavorite: false, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});
await t('owner creates game', () => assertSucceeds(setDoc(gameRef(alice, 'alice', 'hk'), game('hk'))));
await t('owner creates game via batch with board doc', async () => {
  const b = writeBatch(alice);
  b.set(gameRef(alice, 'alice', 'hk2'), game('hk2', { position: 1 }));
  b.set(boardRef(alice, 'alice'), v2Board());
  await assertSucceeds(b.commit());
});
await t('create rejects unknown key', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad1'), game('bad1', { itemIds: [] }))));
await t('create rejects id mismatch', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad2'), game('other'))));
await t('create rejects rating out of range', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad3'), game('bad3', { rating: 11 }))));
await t('create rejects non-integer rating', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad4'), game('bad4', { rating: 4.5 }))));
await t('create rejects missing title', () => { const { title: _t, ...noTitle } = game('bad5'); return assertFails(setDoc(gameRef(alice, 'alice', 'bad5'), noTitle)); });
await t('create rejects long title', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad6'), game('bad6', { title: 'x'.repeat(201) }))));
await t('create rejects long columnId', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad7'), game('bad7', { columnId: 'c'.repeat(41) }))));
await t('create rejects long cover', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad8'), game('bad8', { cover: 'h'.repeat(1001) }))));
await t('create rejects client updatedAt', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad9'), game('bad9', { updatedAt: new Date() }))));
await t('create rejects client addedAt', () => assertFails(setDoc(gameRef(alice, 'alice', 'bad10'), game('bad10', { addedAt: new Date(2020, 1, 1) }))));
await t('owner patches rating/favourite (merge)', () => assertSucceeds(setDoc(gameRef(alice, 'alice', 'hk'), { rating: 9, isFavorite: true, updatedAt: serverTimestamp() }, { merge: true })));
await t('owner moves game (merge columnId/position)', () => assertSucceeds(setDoc(gameRef(alice, 'alice', 'hk'), { columnId: 'playing', position: 2.25, updatedAt: serverTimestamp() }, { merge: true })));
await t('owner sets completedAt', () => assertSucceeds(setDoc(gameRef(alice, 'alice', 'hk'), { completedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })));
await t('update without updatedAt is rejected', () => assertFails(setDoc(gameRef(alice, 'alice', 'hk'), { rating: 3 }, { merge: true })));
await t('update cannot change addedAt', () => assertFails(setDoc(gameRef(alice, 'alice', 'hk'), { addedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })));
await t('owner reads own game', () => assertSucceeds(getDoc(gameRef(alice, 'alice', 'hk'))));
await t('owner lists own games', () => assertSucceeds(getDocs(gamesCol(alice, 'alice'))));
await t('owner deletes game', () => assertSucceeds(deleteDoc(gameRef(alice, 'alice', 'hk2'))));

console.log('Game documents: other users');
await t('non-owner cannot create game', () => assertFails(setDoc(gameRef(dave, 'alice', 'evil'), game('evil'))));
await t('non-owner cannot update game', () => assertFails(setDoc(gameRef(dave, 'alice', 'hk'), { rating: 1, updatedAt: serverTimestamp() }, { merge: true })));
await t('non-owner cannot delete game', () => assertFails(deleteDoc(gameRef(dave, 'alice', 'hk'))));
await t('unauthenticated cannot read public user game', () => assertFails(getDoc(gameRef(anon, 'alice', 'g1'))));
await t('stranger reads public user game', () => assertSucceeds(getDoc(gameRef(dave, 'alice', 'g1'))));
await t('stranger lists public user games', () => assertSucceeds(getDocs(gamesCol(dave, 'alice'))));
await t('stranger cannot read invite_only user game (not a follower)', () => assertFails(getDoc(gameRef(as('frank'), 'bob', 'g1'))));
await t('stranger cannot list invite_only user games', () => assertFails(getDocs(gamesCol(as('frank'), 'bob'))));
await t('stranger cannot read private user game', () => assertFails(getDoc(gameRef(dave, 'carol', 'g1'))));
await t('blocked user cannot read public user game', () => assertFails(getDoc(gameRef(mallory, 'alice', 'g1'))));
await t('blocked user cannot list public user games', () => assertFails(getDocs(gamesCol(mallory, 'alice'))));
await t('accepted follower reads invite_only user game', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(rel(ctx.firestore(), 'bob', 'followers', 'heidi'), { uid: 'heidi', status: 'following', updatedAt: new Date() });
  });
  await assertSucceeds(getDoc(gameRef(as('heidi'), 'bob', 'g1')));
});

console.log('Migration schema 1 -> 2 (S3)');
// yara is still on schema 1: her games live in the board document.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(P(db, 'public_profiles', 'yara'), { uid: 'yara', privacy: 'public', displayName: 'yara' });
  await setDoc(boardRef(db, 'yara'), {
    games: { old1: { id: 'old1', title: 'Hollow Knight', rating: 4.42, isFavorite: true }, old2: { id: 'old2', title: 'Tunic', rating: 8 } },
    columns: { backlog: { id: 'backlog', title: 'To Play', icon: 'clock', itemIds: ['old1'] } },
    columnOrder: ['backlog'],
  });
});
const yara = as('yara');

await t('games can be created while the board is still schema 1', () => assertSucceeds(
  setDoc(gameRef(yara, 'yara', 'old1'), game('old1', { rating: 0, isFavorite: true, position: 0 })),
));
await t('migration batch writes the games and flips the board to v2', async () => {
  const b = writeBatch(yara);
  b.set(gameRef(yara, 'yara', 'old2'), game('old2', { rating: 8, position: 1 }));
  b.set(boardRef(yara, 'yara'), v2Board());
  await assertSucceeds(b.commit());
});
await t('re-running patches an existing game without moving addedAt', () => assertSucceeds(
  setDoc(gameRef(yara, 'yara', 'old1'), { title: 'Hollow Knight', columnId: 'backlog', position: 0, rating: 0, isFavorite: true, updatedAt: serverTimestamp() }, { merge: true }),
));
await t('re-running cannot downgrade the migrated board', () => assertFails(
  setDoc(boardRef(yara, 'yara'), { games: {}, columns: {}, columnOrder: [] }),
));
await t('migration cannot leave the games map on the v2 board', () => assertFails(
  setDoc(boardRef(yara, 'yara'), { ...v2Board(), games: {} }),
));
await t('a legacy float rating cannot be carried over as-is', () => assertFails(
  setDoc(gameRef(yara, 'yara', 'old3'), game('old3', { rating: 4.42 })),
));

await t('create accepts the migratedAt marker (S5 bulk-import signal)', () => assertSucceeds(
  setDoc(gameRef(yara, 'yara', 'old4'), game('old4', { migratedAt: serverTimestamp() })),
));
await t('create rejects a non-timestamp migratedAt', () => assertFails(
  setDoc(gameRef(yara, 'yara', 'old5'), game('old5', { migratedAt: 'yes' })),
));

console.log('Activity events (S5)');
// Written by the triggers with the admin SDK, so they are seeded with the
// rules disabled here; clients may only ever read them.
const event = (uid, extra = {}) => ({
  appId: APP, uid, type: 'game_added', createdAt: new Date(),
  game: { id: 'g1', title: 'Hollow Knight', cover: '' },
  meta: { toColumnId: 'backlog', columnTitle: 'To Play' }, ...extra,
});
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const uid of ['alice', 'bob', 'carol']) {
    await setDoc(activityRef(db, uid, `${uid}-e1`), event(uid));
  }
});

await t('owner reads own activity', () => assertSucceeds(getDoc(activityRef(alice, 'alice', 'alice-e1'))));
await t('owner of a private profile reads own activity', () => assertSucceeds(getDoc(activityRef(as('carol'), 'carol', 'carol-e1'))));
await t('unauthenticated cannot read activity', () => assertFails(getDoc(activityRef(anon, 'alice', 'alice-e1'))));
await t('stranger reads a public user activity', () => assertSucceeds(getDoc(activityRef(dave, 'alice', 'alice-e1'))));
await t('stranger lists a public user activity', () => assertSucceeds(getDocs(activityCol(dave, 'alice'))));
await t('blocked user cannot read a public user activity', () => assertFails(getDoc(activityRef(mallory, 'alice', 'alice-e1'))));
await t('stranger cannot read an invite_only user activity', () => assertFails(getDoc(activityRef(as('frank'), 'bob', 'bob-e1'))));
await t('stranger cannot read a private user activity', () => assertFails(getDoc(activityRef(dave, 'carol', 'carol-e1'))));
// heidi was accepted as a follower of bob further up.
await t('accepted follower reads an invite_only user activity', () => assertSucceeds(getDoc(activityRef(as('heidi'), 'bob', 'bob-e1'))));
await t('accepted follower lists an invite_only user activity', () => assertSucceeds(getDocs(activityCol(as('heidi'), 'bob'))));

console.log('Activity events: the feed query (S7) and client writes');
// Rules are not filters: a `list` is authorised against the query, not against
// each returned document, so a rule reading resource.data cannot authorise a
// collection group query however it is constrained. A feed page is therefore
// one path-scoped query per friend — which is what these first cases are.
const feedPage = (db, uid) => query(activityCol(db, uid), orderBy('createdAt', 'desc'), limit(30));
await t('a feed page of a followed user is readable', () => assertSucceeds(getDocs(feedPage(as('heidi'), 'bob'))));
await t('a feed page of a public user is readable', () => assertSucceeds(getDocs(feedPage(dave, 'alice'))));
await t('a feed page of a private user is denied', () => assertFails(getDocs(feedPage(dave, 'carol'))));
await t('a feed page of an invite_only user you do not follow is denied', () => assertFails(getDocs(feedPage(as('frank'), 'bob'))));
await t('a blocked user cannot page a public user', () => assertFails(getDocs(feedPage(mallory, 'alice'))));

// S7 pages with the last DocumentSnapshot, not its createdAt: several events
// of one game write share a server timestamp, so a value cursor would skip
// their siblings. The cursor must not change how the query is authorised.
await t('a cursored feed page is still readable', async () => {
  const first = await getDocs(feedPage(dave, 'alice'));
  const cursor = first.docs[first.docs.length - 1];
  return assertSucceeds(getDocs(query(
    activityCol(dave, 'alice'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(30),
  )));
});

const groupFor = (db, uid) => query(collectionGroup(db, 'activity'), where('uid', '==', uid));
await t('collection group query is denied even for a followed user', () => assertFails(getDocs(groupFor(as('heidi'), 'bob'))));
await t('collection group query is denied for a public user', () => assertFails(getDocs(groupFor(dave, 'alice'))));
await t('collection group query is denied for a private user', () => assertFails(getDocs(groupFor(dave, 'carol'))));
await t('unfiltered collection group query is denied', () => assertFails(getDocs(collectionGroup(dave, 'activity'))));
await t('owner cannot write their own activity', () => assertFails(setDoc(activityRef(alice, 'alice', 'forged'), event('alice'))));
await t('owner cannot edit their own activity', () => assertFails(setDoc(activityRef(alice, 'alice', 'alice-e1'), { type: 'game_completed' }, { merge: true })));
await t('owner cannot delete their own activity', () => assertFails(deleteDoc(activityRef(alice, 'alice', 'alice-e1'))));
await t('stranger cannot write to someone else activity', () => assertFails(setDoc(activityRef(dave, 'alice', 'forged2'), event('alice'))));

console.log(`\n${passed} passed, ${failed} failed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
