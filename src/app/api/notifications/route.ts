import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notifications')
    .select('*')
    .eq('user_id', authResult.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const { id, markAllRead } = await request.json();
  const admin = createAdminClient();
  let query = admin.from('notifications').update({ is_read: true }).eq('user_id', authResult.user.id);

  if (!markAllRead) {
    if (!id) return NextResponse.json({ error: 'Notification id is required.' }, { status: 400 });
    query = query.eq('id', id);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
