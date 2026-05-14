import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotifications } from '@/server/push';

export async function POST() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const admin = createAdminClient();
  const { count, error } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', authResult.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!count) {
    return NextResponse.json({ error: 'No push subscription found for this account yet.' }, { status: 400 });
  }

  await sendPushNotifications(admin, [
    {
      userId: authResult.user.id,
      category: 'admin',
      title: 'Push notifications are ready',
      message: 'PowerMatix can now reach this device even when the app is in the background.',
      link: '/dashboard',
      tag: `push-test:${authResult.user.id}`,
    },
  ]);

  return NextResponse.json({ ok: true, subscriptions: count });
}
