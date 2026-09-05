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
  doc, getDoc, setDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';

const APP = 'gengemz-prod';
const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { rules: readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const P = (db, ...seg) => doc(db, 'artifacts', APP, ...seg);
const boardRef = (db, uid) => P(db, 'users', uid, 'data', 'board');
const rel = (db, owner, type, other) => P(db, 'relationships', owner, type, other);

// Seed: alice public, bob invite_only, carol private. Each has a board.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [uid, privacy] of [['alice', 'public'], ['bob', 'invite_only'], ['carol', 'private']]) {
    await setDoc(P(db, 'public_profiles', uid), { uid, privacy, displayName: uid });
    await setDoc(boardRef(db, uid), { games: {}, columns: {}, columnOrder: [] });
  }
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

console.log(`\n${passed} passed, ${failed} failed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
