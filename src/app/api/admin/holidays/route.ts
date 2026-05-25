import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser, requireUserRole } from '@/server/auth';

const HOLIDAY_TYPES = ['public', 'company', 'optional'] as const;

function normalizeHolidayPayload(body: Record<string, unknown>) {
  const name = String(body.name ?? body.holidayName ?? '').trim();
  const startDate = String(body.startDate ?? body.date ?? body.holidayDate ?? '').slice(0, 10);
  const endDate = String(body.endDate ?? body.startDate ?? body.date ?? body.holidayDate ?? '').slice(0, 10);
  const type = String(body.type ?? body.holidayType ?? 'public');

  if (!name || !startDate || !endDate) {
    return { error: 'Holiday name, start date, and end date are required.' };
  }

  if (endDate < startDate) {
    return { error: 'Holiday end date must be on or after the start date.' };
  }

  if (!HOLIDAY_TYPES.includes(type as (typeof HOLIDAY_TYPES)[number])) {
    return { error: 'Holiday type must be public, company, or optional.' };
  }

  return {
    payload: {
      holiday_name: name,
      holiday_date: startDate,
      start_date: startDate,
      end_date: endDate,
      recurring: Boolean(body.recurring),
      holiday_type: type,
      description: String(body.description ?? '').trim() || null,
    },
  };
}

export async function GET() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response) return authResult.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('holidays')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const normalized = normalizeHolidayPayload(await request.json());
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { data, error } = await authResult.admin
    .from('holidays')
    .insert(normalized.payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const body = await request.json();
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Holiday id is required.' }, { status: 400 });

  const normalized = normalizeHolidayPayload(body);
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { data, error } = await authResult.admin
    .from('holidays')
    .update(normalized.payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? String((await request.json().catch(() => ({}))).id ?? '');
  if (!id) return NextResponse.json({ error: 'Holiday id is required.' }, { status: 400 });

  const { error } = await authResult.admin.from('holidays').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
