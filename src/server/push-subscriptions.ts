import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function savePushSubscription(request: Request, user: User) {
  const subscription = (await request.json()) as PushSubscriptionBody;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: 'A valid push subscription with endpoint, keys.p256dh, and keys.auth is required.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      subscription,
      user_agent: request.headers.get('user-agent'),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  console.info('Push subscription saved', {
    userId: user.id,
    endpointHost: safeEndpointHost(endpoint),
  });

  return NextResponse.json({ ok: true });
}

export async function deletePushSubscription(request: Request, user: User) {
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: 'Endpoint is required.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

function safeEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
}
