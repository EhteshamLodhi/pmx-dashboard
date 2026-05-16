import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationCategory } from '@/app/types';

type PushInput = {
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  tag?: string;
};

type StoredSubscription = {
  id: string;
  user_id: string;
  subscription: unknown;
};

type PushDeliveryResult = {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  stale: number;
  failures: Array<{
    subscriptionId: string;
    userId: string;
    statusCode?: number;
    message: string;
  }>;
};

function notificationVibration(category: NotificationCategory) {
  if (category === 'approval') return [300, 120, 300, 120, 600];
  if (category === 'attendance') return [250, 100, 250, 100, 250];
  return [200, 100, 200, 100, 400];
}

async function loadWebPush() {
  const mod = await import('web-push');
  return (mod.default ?? mod) as {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
    sendNotification: (subscription: unknown, payload: string) => Promise<{ statusCode?: number }>;
  };
}

function hasPushConfiguration() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

export async function sendPushNotifications(admin: SupabaseClient, inputs: PushInput[]) {
  const result: PushDeliveryResult = {
    configured: hasPushConfiguration(),
    attempted: 0,
    sent: 0,
    failed: 0,
    stale: 0,
    failures: [],
  };

  if (!result.configured || inputs.length === 0) return result;

  const webpush = await loadWebPush();
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );

  const userIds = [...new Set(inputs.map((input) => input.userId))];
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .in('user_id', userIds);

  if (error) {
    result.failed = inputs.length;
    result.failures.push({
      subscriptionId: 'supabase-query',
      userId: userIds.join(','),
      message: error.message,
    });
    return result;
  }

  if (!data?.length) return result;

  const subscriptionsByUser = new Map<string, StoredSubscription[]>();
  for (const item of data as StoredSubscription[]) {
    const list = subscriptionsByUser.get(item.user_id) ?? [];
    list.push(item);
    subscriptionsByUser.set(item.user_id, list);
  }

  const staleSubscriptionIds: string[] = [];

  await Promise.all(
    inputs.flatMap((input) =>
      (subscriptionsByUser.get(input.userId) ?? []).map(async (subscription) => {
        result.attempted += 1;
        try {
          await webpush.sendNotification(
            subscription.subscription,
            JSON.stringify({
              title: input.title,
              message: input.message,
              category: input.category,
              link: input.link ?? '/dashboard',
              tag: input.tag ?? `${input.category}:${input.userId}`,
              vibrate: notificationVibration(input.category),
            }),
          );
          result.sent += 1;
        } catch (error) {
          const statusCode =
            typeof error === 'object' && error && 'statusCode' in error
              ? Number((error as { statusCode?: number }).statusCode)
              : undefined;
          const message = error instanceof Error ? error.message : 'Unknown push delivery error';

          if (statusCode === 404 || statusCode === 410) {
            staleSubscriptionIds.push(subscription.id);
            result.stale += 1;
            return;
          }

          result.failed += 1;
          result.failures.push({
            subscriptionId: subscription.id,
            userId: input.userId,
            statusCode,
            message,
          });

          console.error('Push delivery failed', {
            subscriptionId: subscription.id,
            userId: input.userId,
            statusCode,
            error,
          });
        }
      }),
    ),
  );

  if (staleSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', staleSubscriptionIds);
  }

  return result;
}
