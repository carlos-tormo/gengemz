// QA funcional (issue #3 / PR #4): exercises the real relationship writes
// that `relationshipService.js` performs, against the Firestore + Functions
// emulators (firebase.json: firestore 8080, functions 5001, auth 9099), and
// asserts the three notification triggers actually fire and write the right
// documents. Not a unit test — this goes through the deployed trigger code
// (functions/notifications.js) via the emulator, exactly as the real app
// would (writes as each authenticated user, gated by firestore.rules, same
// as `initializeTestEnvironment` in tests/firestore.rules.test.mjs), and
// touches no production data.
//
// Run from repo root:
//   node .qa-evidence/issue-3/qa-notifications-triggers.mjs
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '../../tests/node_modules/@firebase/rules-unit-testing/dist/index.cjs.js';
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where,
  writeBatch,
} from '../../tests/node_modules/firebase/firestore/dist/index.cjs.js';

const APP = 'gengemztest-9582e';
const env = await initializeTestEnvironment({
  projectId: APP,
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const P = (db, ...seg) => doc(db, 'artifacts', APP, ...seg);
const rel = (db, owner, type, other) => P(db, 'relationships', owner, type, other);
const notificationsOf = (db, uid) => collection(db, 'artifacts', APP, 'users', uid, 'notifications');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const t = async (name, fn) => {
  try { await fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

// Poll for the trigger's write to land instead of a fixed sleep: the
// emulator runs the trigger asynchronously.
const waitForNotification = async (db, uid, type, timeoutMs = 10000) => {
  const q = query(notificationsOf(db, uid), where('type', '==', type));
  const start = Date.now();
  for (;;) {
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0];
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${type} notification for ${uid}`);
    await wait(300);
  }
};

console.log('Seed: alice (public), bob (invite_only)');
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(P(db, 'public_profiles', 'alice'), { uid: 'alice', privacy: 'public', displayName: 'Alice' });
  await setDoc(P(db, 'public_profiles', 'bob'), { uid: 'bob', privacy: 'invite_only', displayName: 'Bob' });
});

const dave = as('dave'); const bob = as('bob'); const heidi = as('heidi');

console.log('\nfollow_request: dave requests to follow bob (invite_only) — exactly what followProfile() does');
await setDoc(rel(dave, 'dave', 'following', 'bob'), {
  uid: 'bob', displayName: 'Bob', photoURL: '', status: 'pending', updatedAt: serverTimestamp(),
});
await setDoc(rel(dave, 'bob', 'requests', 'dave'), {
  uid: 'dave', displayName: 'Dave', photoURL: '', status: 'pending', createdAt: serverTimestamp(),
});
await t('bob receives a follow_request notification from dave', async () => {
  const docSnap = await waitForNotification(bob, 'bob', 'follow_request');
  const data = docSnap.data();
  if (data.fromUid !== 'dave') throw new Error(`fromUid was ${data.fromUid}`);
  if (data.fromDisplayName !== 'Dave') throw new Error(`fromDisplayName was ${data.fromDisplayName}`);
  if (data.readAt !== null) throw new Error('readAt should start null');
});

console.log('\nrequest_accepted: bob accepts, via the exact batch acceptFollowRequest() sends');
const acceptBatch = writeBatch(bob);
acceptBatch.set(rel(bob, 'bob', 'followers', 'dave'), {
  uid: 'dave', displayName: 'Dave', photoURL: '', status: 'following', updatedAt: serverTimestamp(),
}, { merge: true });
acceptBatch.set(rel(bob, 'dave', 'following', 'bob'), {
  uid: 'bob', displayName: 'Bob', photoURL: '', status: 'following', updatedAt: serverTimestamp(),
}, { merge: true });
acceptBatch.delete(rel(bob, 'bob', 'requests', 'dave'));
await acceptBatch.commit();

await t('dave receives a request_accepted notification from bob', async () => {
  const docSnap = await waitForNotification(dave, 'dave', 'request_accepted');
  const data = docSnap.data();
  if (data.fromUid !== 'bob') throw new Error(`fromUid was ${data.fromUid}`);
  if (data.fromDisplayName !== 'Bob') throw new Error(`fromDisplayName was ${data.fromDisplayName}`);
});

await t('bob also receives a new_follower notification from dave (the followers doc the accept batch wrote)', async () => {
  const docSnap = await waitForNotification(bob, 'bob', 'new_follower');
  const data = docSnap.data();
  if (data.fromUid !== 'dave') throw new Error(`fromUid was ${data.fromUid}`);
});

console.log('\nnew_follower (direct, public profile): heidi follows alice — exactly what followProfile() does for a public profile');
const alice = as('alice');
await setDoc(rel(heidi, 'heidi', 'following', 'alice'), {
  uid: 'alice', displayName: 'Alice', photoURL: '', status: 'following', updatedAt: serverTimestamp(),
});
await setDoc(rel(heidi, 'alice', 'followers', 'heidi'), {
  uid: 'heidi', displayName: 'Heidi', photoURL: '', status: 'following', updatedAt: serverTimestamp(),
});
await t('alice receives a new_follower notification from heidi', async () => {
  const docSnap = await waitForNotification(alice, 'alice', 'new_follower');
  const data = docSnap.data();
  if (data.fromUid !== 'heidi') throw new Error(`fromUid was ${data.fromUid}`);
});

await t('heidi does NOT receive a request_accepted notification (direct public follow has no pending step)', async () => {
  await wait(1500); // give the emulator time to have fired anything it was going to
  const snap = await getDocs(query(notificationsOf(heidi, 'heidi'), where('type', '==', 'request_accepted')));
  if (!snap.empty) throw new Error('unexpected request_accepted notification for heidi');
});

console.log('\nreadAt: the client marks a notification read (rules-gated to that one field, exercised for real here)');
await t('bob marks his own follow_request notification read', async () => {
  const snap = await getDocs(query(notificationsOf(bob, 'bob'), where('type', '==', 'follow_request')));
  const notifDoc = snap.docs[0];
  await setDoc(notifDoc.ref, { readAt: serverTimestamp() }, { merge: true });
  const after = await getDoc(notifDoc.ref);
  if (!after.data().readAt) throw new Error('readAt was not set');
});
await t('dave cannot mark bob notification read (rules: owner only)', async () => {
  const snap = await getDocs(query(notificationsOf(bob, 'bob'), where('type', '==', 'new_follower')));
  const notifDoc = snap.docs[0];
  const asDave = doc(dave, notifDoc.ref.path);
  let denied = false;
  try {
    await setDoc(asDave, { readAt: serverTimestamp() }, { merge: true });
  } catch {
    denied = true;
  }
  if (!denied) throw new Error('dave was able to write to bob notification');
});

console.log(`\n${passed} passed, ${failed} failed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
