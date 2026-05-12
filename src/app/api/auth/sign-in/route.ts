import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  try {
    const supabase = await createClient();

    if (!supabase) {
      return NextResponse.redirect(new URL('/?authError=supabase_not_configured', requestUrl.origin));
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${requestUrl.origin}/auth/callback`,
        scopes: 'email profile openid offline_access User.Read',
      },
    });

    if (error || !data?.url) {
      const errorUrl = new URL('/', requestUrl.origin);
      errorUrl.searchParams.set('authError', 'microsoft_sign_in_failed');
      return NextResponse.redirect(errorUrl);
    }

    return NextResponse.redirect(data.url);
  } catch (error) {
    const errorUrl = new URL('/', requestUrl.origin);
    errorUrl.searchParams.set('authError', 'microsoft_sign_in_failed');
    errorUrl.searchParams.set(
      'authDetail',
      error instanceof Error ? error.message : 'Unknown Microsoft sign-in error',
    );
    return NextResponse.redirect(errorUrl);
  }
}
