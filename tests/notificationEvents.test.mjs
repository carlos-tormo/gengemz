// Unit tests for the notification derivation (S8). Pure functions from
// functions/notificationEvents.js — no emulator, no admin SDK. Run from the
// repo root (gengemz/):
//   node tests/notificationEvents.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FOLLOW_REQUEST, REQUEST_ACCEPTED, NEW_FOLLOWER,
  isAcceptance, notificationId, text,
} = require('../functions/notificationEvents.js');

let passed = 0; let failed = 0;
const t = (name, fn) => {
  try { fn(); passed += 1; console.log('  ok   ', name); } catch (e) { failed += 1; console.log('  FAIL ', name, '-', e.message.split('\n')[0]); }
};

console.log('notificationId');
t('is deterministic for the same trigger event and type', () => {
  assert.equal(notificationId('abc123', FOLLOW_REQUEST), notificationId('abc123', FOLLOW_REQUEST));
});
t('differs by type for the same trigger event (three triggers, one event id space)', () => {
  assert.notEqual(notificationId('abc123', FOLLOW_REQUEST), notificationId('abc123', NEW_FOLLOWER));
});
t('strips characters a Firestore doc id cannot hold', () => {
  assert.equal(notificationId('projects/p/e:1', REQUEST_ACCEPTED), 'projects_p_e_1_request_accepted');
});
t('falls back on a missing trigger event id rather than an empty segment', () => {
  assert.equal(notificationId('', NEW_FOLLOWER), 'event_new_follower');
});

console.log('isAcceptance');
t('pending -> following is an acceptance', () => {
  assert.equal(isAcceptance({ status: 'pending' }, { status: 'following' }), true);
});
t('a direct create (no before) is not an acceptance', () => {
  assert.equal(isAcceptance(null, { status: 'following' }), false);
});
t('following -> following (no-op update) is not an acceptance', () => {
  assert.equal(isAcceptance({ status: 'following' }, { status: 'following' }), false);
});
t('following -> pending is not an acceptance', () => {
  assert.equal(isAcceptance({ status: 'following' }, { status: 'pending' }), false);
});
t('a delete (no after) is not an acceptance', () => {
  assert.equal(isAcceptance({ status: 'pending' }, null), false);
});

console.log('text');
t('truncates to the max length', () => {
  assert.equal(text('x'.repeat(100), 5), 'xxxxx');
});
t('a non-string becomes empty rather than throwing', () => {
  assert.equal(text(undefined, 10), '');
  assert.equal(text(null, 10), '');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
