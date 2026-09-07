import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { APP_ID } from '../config/constants';
import { db } from '../config/firebase';

// In-app notifications (S8): owner-only, written by the Cloud Functions
// triggers on the relationship collections. The client's one write is
// `readAt`, gated to that single field by firestore.rules.
const NOTIFICATIONS_PAGE_SIZE = 50;

const notificationsCollection = (uid) =>
  collection(db, 'artifacts', APP_ID, 'users', uid, 'notifications');

export const subscribeToNotifications = (user, onNotifications, onError = console.error) => {
  if (!user) return () => {};
  const notificationsQuery = query(
    notificationsCollection(user.uid),
    orderBy('createdAt', 'desc'),
    limit(NOTIFICATIONS_PAGE_SIZE),
  );
  return onSnapshot(
    notificationsQuery,
    (snapshot) => onNotifications(
      snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() })),
    ),
    onError,
  );
};

// Marks every given id read in one batch. Called once when /notifications
// opens, not per-render, so scrolling never re-fires it.
export const markNotificationsRead = async (user, unreadIds) => {
  if (!user || !unreadIds.length) return { ok: true };
  try {
    const batch = writeBatch(db);
    unreadIds.forEach((id) => {
      batch.update(doc(notificationsCollection(user.uid), id), { readAt: serverTimestamp() });
    });
    await batch.commit();
    return { ok: true };
  } catch (error) {
    console.error('Mark notifications read failed', error);
    return { ok: false, error: error.message || 'Failed' };
  }
};
