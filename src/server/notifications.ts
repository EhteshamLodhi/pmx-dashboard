import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationCategory } from '@/app/types';
import { sendPushNotifications } from '@/server/push';

type NotificationInput = {
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  sourceKey?: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string | null;
  source_key?: string | null;
};

function toPushInput(row: NotificationRow) {
  return {
    userId: row.user_id,
    category: row.category,
    title: row.title,
    message: row.message,
    link: row.link ?? undefined,
    notificationId: row.id,
    tag: row.id,
  };
}

export async function createNotification(admin: SupabaseClient, input: NotificationInput) {
  const payload = {
    user_id: input.userId,
    category: input.category,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    source_key: input.sourceKey ?? null,
  };

  const { data, error } = input.sourceKey
    ? await admin
        .from('notifications')
        .upsert(payload, { onConflict: 'source_key', ignoreDuplicates: true })
        .select('id, user_id, category, title, message, link, source_key')
        .maybeSingle()
    : await admin
        .from('notifications')
        .insert(payload)
        .select('id, user_id, category, title, message, link, source_key')
        .single();

  if (error) throw error;
  if (!data) return null;

  console.info('Notification inserted', {
    notificationId: data.id,
    userId: data.user_id,
    category: data.category,
  });

  await sendPushNotifications(admin, [toPushInput(data as NotificationRow)]);
  return data;
}

export async function createNotifications(admin: SupabaseClient, inputs: NotificationInput[]) {
  if (inputs.length === 0) return;

  const payload = inputs.map((input) => ({
    user_id: input.userId,
    category: input.category,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    source_key: input.sourceKey ?? null,
  }));

  const hasSourceKeys = payload.every((notification) => notification.source_key);
  const { data, error } = hasSourceKeys
    ? await admin
        .from('notifications')
        .upsert(payload, { onConflict: 'source_key', ignoreDuplicates: true })
        .select('id, user_id, category, title, message, link, source_key')
    : await admin
        .from('notifications')
        .insert(payload)
        .select('id, user_id, category, title, message, link, source_key');

  if (error) throw error;
  if (!data?.length) return;

  console.info('Notifications inserted', {
    count: data.length,
  });

  await sendPushNotifications(admin, (data as NotificationRow[]).map(toPushInput));
}

export async function createRoleNotification(
  admin: SupabaseClient,
  roles: string[],
  input: Omit<NotificationInput, 'userId'>,
) {
  const { data: users, error } = await admin
    .from('users')
    .select('id')
    .in('role', roles)
    .eq('is_active', true);

  if (error) throw error;

  await createNotifications(
    admin,
    (users ?? []).map((user) => ({
      userId: user.id,
      ...input,
      sourceKey: input.sourceKey ? `${input.sourceKey}:${user.id}` : undefined,
    })),
  );
}

export async function tryCreateNotification(admin: SupabaseClient, input: NotificationInput) {
  try {
    await createNotification(admin, input);
  } catch (error) {
    console.error('Notification side-effect failed', {
      type: 'single',
      input,
      error,
    });
  }
}

export async function tryCreateNotifications(admin: SupabaseClient, inputs: NotificationInput[]) {
  try {
    await createNotifications(admin, inputs);
  } catch (error) {
    console.error('Notification side-effect failed', {
      type: 'batch',
      inputs,
      error,
    });
  }
}

export async function tryCreateRoleNotification(
  admin: SupabaseClient,
  roles: string[],
  input: Omit<NotificationInput, 'userId'>,
) {
  try {
    await createRoleNotification(admin, roles, input);
  } catch (error) {
    console.error('Role notification side-effect failed', {
      roles,
      input,
      error,
    });
  }
}
