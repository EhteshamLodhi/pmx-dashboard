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

export async function createNotification(admin: SupabaseClient, input: NotificationInput) {
  const payload = {
    user_id: input.userId,
    category: input.category,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    source_key: input.sourceKey ?? null,
  };

  const { error } = input.sourceKey
    ? await admin.from('notifications').upsert(payload, { onConflict: 'source_key', ignoreDuplicates: true })
    : await admin.from('notifications').insert(payload);

  if (error) throw error;

  await sendPushNotifications(admin, [
    {
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link,
      tag: input.sourceKey ?? `${input.category}:${input.userId}`,
    },
  ]);
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
  const { error } = hasSourceKeys
    ? await admin.from('notifications').upsert(payload, { onConflict: 'source_key', ignoreDuplicates: true })
    : await admin.from('notifications').insert(payload);

  if (error) throw error;

  await sendPushNotifications(
    admin,
    inputs.map((input) => ({
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link,
      tag: input.sourceKey ?? `${input.category}:${input.userId}`,
    })),
  );
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
