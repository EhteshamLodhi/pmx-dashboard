'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import type { AppNotification } from '../types';
import { useActionRunner } from '@/app/hooks/useActionRunner';

function categoryLabel(notification: AppNotification) {
  switch (notification.category) {
    case 'attendance':
      return 'Attendance Alert';
    case 'leave':
      return 'Leave Update';
    case 'approval':
      return 'Approval Notification';
    case 'reimbursement':
      return 'Reimbursement Update';
    default:
      return 'Admin Alert';
  }
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationCenter() {
  const router = useRouter();
  const { isPending, runAction } = useActionRunner();
  const {
    notifications,
    unreadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    enablePushNotifications,
    pushNotificationsEnabled,
    pushNotificationsSupported,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pushNotificationsEnabled) {
      setPushMessage('Push is enabled on this device.');
    }
  }, [pushNotificationsEnabled]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleNotificationClick = async (notification: AppNotification) => {
    await runAction(`notification:${notification.id}`, async () => {
      if (!notification.isRead) await markNotificationRead(notification.id);
      setOpen(false);
      if (notification.link) router.push(notification.link);
    });
  };

  const handleEnablePush = async () => {
    setPushMessage(null);
    await runAction('push-enable', async () => {
      setPushMessage(await enablePushNotifications());
    }, {
      loading: 'Enabling push notifications...',
      success: 'Push notifications enabled.',
      error: 'Unable to enable push notifications.',
    }).catch((error) => {
      setPushMessage(error instanceof Error ? error.message : 'Unable to enable push notifications.');
    });
  };
  const enablingPush = isPending('push-enable');
  const markingAllRead = isPending('notifications-read-all');

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="w-5 h-5" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white rounded-full flex items-center justify-center"
            style={{ fontSize: '9px', fontWeight: 700 }}>
            {unreadNotifications > 9 ? '9+' : unreadNotifications}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] sm:hidden" />
          <div className="fixed inset-x-3 top-16 bottom-20 z-50 flex min-h-0 flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl overflow-hidden sm:absolute sm:inset-x-auto sm:top-11 sm:bottom-auto sm:right-0 sm:w-[22rem]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-900 font-semibold text-sm">Notifications</p>
              <p className="text-gray-400 text-xs">{unreadNotifications} unread</p>
            </div>
            <button
              onClick={() => void runAction('notifications-read-all', markAllNotificationsRead, {
                success: 'Notifications marked as read.',
                error: 'Unable to mark notifications as read.',
              })}
              disabled={markingAllRead}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-green-700 hover:bg-green-50 text-xs font-semibold"
            >
              {markingAllRead ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              {markingAllRead ? 'Reading...' : 'Read all'}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => void handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-green-50 transition-colors ${
                    notification.isRead ? 'bg-white' : 'bg-green-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${notification.isRead ? 'bg-gray-200' : 'bg-green-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-green-700 font-bold">
                          {categoryLabel(notification)}
                        </p>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">{relativeTime(notification.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-900 font-semibold mt-0.5">{notification.title}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{notification.message}</p>
                    </div>
                    {notification.link && <ExternalLink className="w-3.5 h-3.5 text-gray-300 mt-1" />}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <button
              onClick={() => void handleEnablePush()}
              disabled={!pushNotificationsSupported || enablingPush}
              className="w-full py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {enablingPush
                ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enabling...
                  </span>
                )
                : !pushNotificationsSupported
                ? 'Push Not Supported Here'
                : pushNotificationsEnabled
                  ? 'Push Enabled On This Device'
                  : 'Enable Push Notifications'}
            </button>
            <p className="text-[11px] text-gray-500 mt-2 text-center">
              {pushNotificationsSupported
                ? pushNotificationsEnabled
                  ? 'All new in-app alerts on this device will also surface as push notifications.'
                  : 'Enable push on this browser or installed app to receive system notifications here.'
                : 'Use Chrome, Edge, or the installed PWA to receive push notifications.'}
            </p>
            {pushMessage && <p className="text-[11px] text-gray-500 mt-2 text-center">{pushMessage}</p>}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
