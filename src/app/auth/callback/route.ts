import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { bootstrapUserProfile } from '@/server/user-bootstrap';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const providerError = requestUrl.searchParams.get('error') ?? requestUrl.searchParams.get('error_description');

  if (providerError) {
    return NextResponse.redirect(new URL('/?authError=microsoft_callback_failed', requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?authError=microsoft_callback_failed', requestUrl.origin));
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL('/?authError=supabase_not_configured', requestUrl.origin));
  }

  let response = NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.headers.get('cookie')
            ?.split(';')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((cookie) => {
              const index = cookie.indexOf('=');
              return {
                name: cookie.slice(0, index),
                value: decodeURIComponent(cookie.slice(index + 1)),
              };
            }) ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/?authError=microsoft_callback_failed', requestUrl.origin));
  }

  const authUser = data?.user ?? data?.session?.user;

  if (authUser) {
    try {
      await bootstrapUserProfile(createAdminClient(), authUser);
    } catch (bootstrapError) {
      console.error('Auth callback profile bootstrap failed', bootstrapError);
      return NextResponse.redirect(new URL('/?authError=microsoft_callback_failed', requestUrl.origin));
    }
  }

  return response;
}
