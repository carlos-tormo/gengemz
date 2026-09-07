import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Bell, Loader2, UserCheck, UserPlus, Users } from 'lucide-react';
import { timeAgo } from '../services/feedService';

/*
 * Notifications list at /notifications (S8). Owner-only, real-time
 * (`useNotifications`); opening the page marks everything unread as read.
 */

const ICONS = {
  follow_request: <UserPlus size={14} />,
  request_accepted: <UserCheck size={14} />,
  new_follower: <Users size={14} />,
};

const sentence = (notification) => {
  switch (notification.type) {
    case 'follow_request': return 'requested to follow you';
    case 'request_accepted': return 'accepted your follow request';
    case 'new_follower': return 'started following you';
    default: return 'did something';
  }
};

const Empty = ({ children }) => (
  <div className="text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl p-6 text-center bg-[var(--panel)]/30">
    {children}
  </div>
);

const NotificationRow = ({ notification, onOpenProfile }) => (
  <button
    onClick={onOpenProfile}
    className={`w-full flex items-center gap-3 text-left bg-[var(--panel)] border rounded-xl p-3 shadow-sm transition-colors ${
      notification.readAt ? 'border-[var(--border)]' : 'border-[var(--accent)]/60 bg-[var(--accent)]/5'
    }`}
  >
    {notification.fromPhotoURL ? (
      <img src={notification.fromPhotoURL} alt="" className="w-9 h-9 rounded-full object-cover border border-[var(--border)] shrink-0" />
    ) : (
      <div className="w-9 h-9 rounded-full bg-[var(--panel-muted)] text-[var(--text)] flex items-center justify-center uppercase text-sm font-bold border border-[var(--border)] shrink-0">
        {(notification.fromDisplayName || 'P')[0]}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="text-sm text-[var(--text)] flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold truncate max-w-[10rem]">{notification.fromDisplayName || 'Player'}</span>
        <span className="text-[var(--accent)]">{ICONS[notification.type]}</span>
        <span className="text-[var(--text-muted)]">{sentence(notification)}</span>
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{timeAgo(notification.createdAt)}</div>
    </div>
    {!notification.readAt && <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" aria-label="Unread" />}
  </button>
);

const NotificationsPage = ({ user, isAuthLoading = false, notifications }) => {
  const navigate = useNavigate();
  const { notifications: items, isLoading, markRead } = notifications;

  // Fires once per mount, when the listener's first snapshot has landed —
  // not on every update, so a notification that arrives while the page is
  // already open is not marked read the instant it renders.
  useEffect(() => {
    if (!isLoading) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  if (isAuthLoading) {
    return (
      <div className="max-w-2xl mx-auto h-48 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!user || user.isAnonymous) {
    return (
      <div className="max-w-2xl mx-auto pt-10">
        <Empty>Sign in with an account to see your notifications here.</Empty>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6"
      >
        <ArrowLeft size={20} />
        <span className="font-semibold">Back to Board</span>
      </button>

      <div className="flex items-center gap-2 mb-4">
        <Bell size={20} className="text-[var(--accent)]" />
        <h1 className="text-2xl font-bold text-[var(--text)]">Notifications</h1>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : items.length === 0 ? (
        <Empty>Nothing here yet — follow requests and new followers will show up here.</Empty>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              notification={item}
              onOpenProfile={() => navigate(`/u/${item.fromUid}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
