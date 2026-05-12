import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser } from '@/server/auth';
import { bootstrapUserProfile } from '@/server/user-bootstrap';

export async function POST() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  try {
    await bootstrapUserProfile(createAdminClient(), authResult.user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to bootstrap user profile.' },
      { status: 400 },
    );
  }
}
