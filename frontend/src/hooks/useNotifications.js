import { useEffect, useMemo, useState } from 'react';
import { markNotificationsRead, subscribeToNotifications } from '../services/notificationService';

const emptyState = (uid) => ({ uid, notifications: [], delivered: false });

/*
 * Owns one notifications session (S8): a real-time listener (owner-only, no
 * S7-style query problem), the unread badge count, and marking read.
 *
 * State is kept tagged by uid (as `useRelationships` does) rather than reset
 * with a setState call in the effect body: switching to no user, or to a
 * different account, is a derived "not current" read during render, so
 * signing out never flashes the previous account's notifications.
 */
const useNotifications = (user) => {
  const [state, setState] = useState(emptyState(null));

  useEffect(() => {
    if (!user || user.isAnonymous) return undefined;
    const { uid } = user;
    return subscribeToNotifications(
      user,
      (next) => setState({ uid, notifications: next, delivered: true }),
      (error) => {
        console.error('Notifications listener failed', error);
        setState({ uid, notifications: [], delivered: true });
      },
    );
  }, [user]);

  const isCurrent = !!user && !user.isAnonymous && state.uid === user.uid;
  const notifications = useMemo(
    () => (isCurrent ? state.notifications : []),
    [isCurrent, state.notifications],
  );
  const isLoading = !!user && !user.isAnonymous && (!isCurrent || !state.delivered);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  // Marks every notification unread *right now* — a snapshot, not a live
  // filter, so a notification that arrives while /notifications is already
  // open stays unread until the next call instead of racing the listener.
  const markRead = () => {
    const unreadIds = notifications
      .filter((notification) => !notification.readAt)
      .map((notification) => notification.id);
    return markNotificationsRead(user, unreadIds);
  };

  return { notifications, isLoading, unreadCount, markRead };
};

export default useNotifications;
