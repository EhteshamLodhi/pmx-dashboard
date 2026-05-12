import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { getAuthUserDisplayName } from '@/server/auth';

export async function bootstrapUserProfile(admin: SupabaseClient, authUser: SupabaseAuthUser) {
  const email = authUser.email;
  if (!email) {
    throw new Error('Authenticated user is missing an email address.');
  }

  const fullName = getAuthUserDisplayName(authUser);

  const { data: existingUser, error: existingUserError } = await admin
    .from('users')
    .select('id, role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existingUserError) {
    throw existingUserError;
  }

  if (existingUser) {
    const { error } = await admin
      .from('users')
      .update({
        email,
        full_name: fullName,
      })
      .eq('id', authUser.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await admin
    .from('users')
    .insert({
      id: authUser.id,
      email,
      full_name: fullName,
      role: 'employee',
    });

  if (error) {
    throw error;
  }
}
