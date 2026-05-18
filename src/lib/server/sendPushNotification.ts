import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotifications } from '@/server/push';
import type { NotificationCategory } from '@/app/types';

export function sendPushNotification(
  userId: string,
  payload: {
    title: string;
    body: string;
    url?: string;
    notificationId?: string;
    type?: NotificationCategory;
  },
) {
  const admin = createAdminClient();
  return sendPushNotifications(admin, [
    {
      userId,
      category: payload.type ?? 'admin',
      title: payload.title,
      message: payload.body,
      link: payload.url,
      notificationId: payload.notificationId,
    },
  ]);
}
