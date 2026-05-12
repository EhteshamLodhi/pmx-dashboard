import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/app/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function requireAuthenticatedUser() {
  const supabase = await createServerClient();
  if (!supabase) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }),
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }

  return { user, response: null };
}

export async function requireUserRole(roles: UserRole[]) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) {
    return {
      admin: null,
      appUser: null,
      authUser: null,
      response: authResult.response,
    };
  }

  const admin = createAdminClient();
  const { data: appUser, error } = await admin
    .from('users')
    .select('id, role, email, full_name')
    .eq('id', authResult.user.id)
    .maybeSingle();

  if (error || !appUser || !roles.includes(appUser.role as UserRole)) {
    return {
      admin: null,
      appUser: null,
      authUser: authResult.user,
      response: NextResponse.json({ error: 'You do not have access to this action.' }, { status: 403 }),
    };
  }

  return {
    admin,
    appUser,
    authUser: authResult.user,
    response: null,
  };
}

export function getAuthUserDisplayName(user: SupabaseAuthUser) {
  const metadata = user.user_metadata ?? {};
  const givenName = typeof metadata.given_name === 'string' ? metadata.given_name : '';
  const familyName = typeof metadata.family_name === 'string' ? metadata.family_name : '';
  const joinedName = [givenName, familyName].filter(Boolean).join(' ').trim();

  return (
    (typeof metadata.full_name === 'string' && metadata.full_name) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    joinedName ||
    user.email ||
    'PowerMatix User'
  );
}
