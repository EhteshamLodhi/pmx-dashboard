import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const subscription = await request.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'A valid push subscription is required.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: authResult.user.id,
      endpoint: subscription.endpoint,
      subscription,
      user_agent: request.headers.get('user-agent'),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
