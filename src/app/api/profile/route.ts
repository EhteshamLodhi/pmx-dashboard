import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser } from '@/server/auth';

export async function GET() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('*, project:project_id(name)')
    .eq('id', authResult.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: 'User profile was not found.' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const body = await request.json();
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .update({
      phone: phone || null,
    })
    .eq('id', authResult.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
