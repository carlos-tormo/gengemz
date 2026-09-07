"use strict";

/*
 * In-app notifications (S8), Firestore side.
 *
 * Three triggers, all writing through the admin SDK (so `firestore.rules`
 * denies every client write to `notifications` without locking these out):
 *
 *   onFollowRequestCreated
 *     artifacts/{appId}/relationships/{ownerUid}/requests/{requesterUid}
 *   onFollowAccepted
 *     artifacts/{appId}/relationships/{requesterUid}/following/{targetUid}
 *   onNewFollower
 *     artifacts/{appId}/relationships/{ownerUid}/followers/{followerUid}
 *
 * The derivation itself lives in `notificationEvents.js` and is unit-tested
 * without an emulator; this file only reads the triggering document and
 * writes the notification.
 */

const {onDocumentCreated, onDocumentUpdated} =
  require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const events = require("./notificationEvents");

if (!admin.apps.length) admin.initializeApp();

const db = () => admin.firestore();
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

const notificationsCollection = (appId, uid) => db()
    .collection("artifacts").doc(appId)
    .collection("users").doc(uid)
    .collection("notifications");

const dataOf = (snapshot) => (
  snapshot && snapshot.exists ? snapshot.data() : null
);

const writeNotification = async (appId, uid, triggerEventId, type, from) => {
  const ref = notificationsCollection(appId, uid).doc(
      events.notificationId(triggerEventId, type),
  );
  await ref.set({
    appId,
    uid,
    type,
    fromUid: from.uid,
    fromDisplayName: events.text(from.displayName, 80),
    fromPhotoURL: events.text(from.photoURL, 1000),
    createdAt: serverTimestamp(),
    readAt: null,
  });
};

exports.onFollowRequestCreated = onDocumentCreated(
    "artifacts/{appId}/relationships/{ownerUid}/requests/{requesterUid}",
    async (event) => {
      const {appId, ownerUid, requesterUid} = event.params;
      const request = dataOf(event.data);
      if (!request) return;

      await writeNotification(
          appId, ownerUid, event.id, events.FOLLOW_REQUEST, {
            uid: request.uid || requesterUid,
            displayName: request.displayName,
            photoURL: request.photoURL,
          },
      );
    },
);

exports.onFollowAccepted = onDocumentUpdated(
    "artifacts/{appId}/relationships/{requesterUid}/following/{targetUid}",
    async (event) => {
      const {appId, requesterUid, targetUid} = event.params;
      const before = dataOf(event.data && event.data.before);
      const after = dataOf(event.data && event.data.after);
      if (!events.isAcceptance(before, after)) return;

      await writeNotification(
          appId, requesterUid, event.id, events.REQUEST_ACCEPTED, {
            uid: targetUid,
            displayName: after.displayName,
            photoURL: after.photoURL,
          },
      );
    },
);

exports.onNewFollower = onDocumentCreated(
    "artifacts/{appId}/relationships/{ownerUid}/followers/{followerUid}",
    async (event) => {
      const {appId, ownerUid, followerUid} = event.params;
      const follower = dataOf(event.data);
      if (!follower) return;

      await writeNotification(appId, ownerUid, event.id, events.NEW_FOLLOWER, {
        uid: follower.uid || followerUid,
        displayName: follower.displayName,
        photoURL: follower.photoURL,
      });
    },
);
