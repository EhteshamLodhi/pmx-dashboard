import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function requireSupabase() {
  const supabase = await createClient();
  if (!supabase) {
    return {
      supabase: null,
      response: NextResponse.json(
        { error: 'Supabase is not configured. Add environment variables to enable live backend APIs.' },
        { status: 503 },
      ),
    };
  }
  return { supabase, response: null };
}
