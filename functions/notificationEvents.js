"use strict";

/*
 * In-app notifications (S8), pure part.
 *
 * Mirrors the activity/activityEvents split (S5): no Firebase imports here, so
 * `tests/notificationEvents.test.mjs` runs it in node without an emulator.
 * `notifications.js` wraps this with the Firestore triggers.
 *
 * Notification document (artifacts/{appId}/users/{uid}/notifications/{id}):
 *   { appId, uid, type, fromUid, fromDisplayName, fromPhotoURL, createdAt,
 *     readAt }
 */

const FOLLOW_REQUEST = "follow_request";
const REQUEST_ACCEPTED = "request_accepted";
const NEW_FOLLOWER = "new_follower";

const NOTIFICATION_TYPES = [FOLLOW_REQUEST, REQUEST_ACCEPTED, NEW_FOLLOWER];

const text = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLength);
};

/*
 * A document id that is stable across retries of the same trigger event, so
 * the at-least-once delivery of Eventarc cannot double-post a notification.
 * Same rationale as `activityEventId` in activityEvents.js.
 */
const notificationId = (triggerEventId, type) => {
  const safe = String(triggerEventId || "")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 200);
  return `${safe || "event"}_${type}`;
};

/*
 * A follow request is accepted exactly when the requester's own `following`
 * entry for the target flips from "pending" to "following" — the only status
 * transition `acceptFollowRequest` (relationshipService.js) produces on that
 * document. A direct follow of a public profile creates that document already
 * at "following" (a create, not this update), so it never matches here.
 */
const isAcceptance = (before, after) => (
  !!before && !!after &&
  before.status === "pending" && after.status === "following"
);

module.exports = {
  FOLLOW_REQUEST,
  REQUEST_ACCEPTED,
  NEW_FOLLOWER,
  NOTIFICATION_TYPES,
  isAcceptance,
  notificationId,
  text,
};
