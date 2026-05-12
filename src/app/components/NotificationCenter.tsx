'use client';

import { useState } from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import type { AppNotification } from '../types';

function categoryLabel(notification: AppNotification) {
  switch (notification.category) {
    case 'attendance':
      return 'Attendance Alert';
    case 'leave':
      return 'Leave Update';
    case 'approval':
      return 'Approval Notification';
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
  const {
    notifications,
    unreadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    enablePushNotifications,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.isRead) await markNotificationRead(notification.id);
    setOpen(false);
    if (notification.link) router.push(notification.link);
  };

  const handleEnablePush = async () => {
    try {
      await enablePushNotifications();
      setPushMessage('Push enabled');
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : 'Unable to enable push notifications.');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        aria-label="Notifications"
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
        <div className="absolute right-0 top-11 w-[min(22rem,calc(100vw-2rem))] bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-900 font-semibold text-sm">Notifications</p>
              <p className="text-gray-400 text-xs">{unreadNotifications} unread</p>
            </div>
            <button
              onClick={() => void markAllNotificationsRead()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-green-700 hover:bg-green-50 text-xs font-semibold"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Read all
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
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
              className="w-full py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-semibold"
            >
              Enable Push Notifications
            </button>
            {pushMessage && <p className="text-[11px] text-gray-500 mt-2 text-center">{pushMessage}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
