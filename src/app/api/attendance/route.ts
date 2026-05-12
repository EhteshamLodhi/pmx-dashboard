import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser } from '@/server/auth';
import { requireSupabase } from '@/server/responses';

function localNow() {
  const now = new Date();
  const offsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? '300');
  return new Date(now.getTime() + offsetMinutes * 60_000);
}

function localDateIso(value = localNow()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTime(value = localNow()) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function attendanceStatus(reportingTime: string, graceMinutes: number, checkInTime: string) {
  const cutoff = minutesFromTime(reportingTime) + graceMinutes;
  return minutesFromTime(checkInTime) > cutoff ? 'late' : 'present';
}

export async function GET() {
  const { supabase, response } = await requireSupabase();
  if (response) return response;

  const { data, error } = await supabase
    .from('attendance_logs')
    .select('*, users:employee_id(full_name, email, department_id, reporting_time)')
    .order('work_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body?.action === 'check-in' || body?.action === 'check-out') {
    const authResult = await requireAuthenticatedUser();
    if (authResult.response || !authResult.user) return authResult.response;

    const admin = createAdminClient();
    const now = new Date();
    const workDate = localDateIso();

    const { data: appUser, error: userError } = await admin
      .from('users')
      .select('id, reporting_time, check_in_grace_minutes, is_active')
      .eq('id', authResult.user.id)
      .maybeSingle();

    if (userError || !appUser?.is_active) {
      return NextResponse.json({ error: 'Employee profile is not active or configured yet.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await admin
      .from('attendance_logs')
      .select('id, check_in_at, check_out_at, status')
      .eq('employee_id', authResult.user.id)
      .eq('work_date', workDate)
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    if (body.action === 'check-in') {
      if (existing?.check_in_at) return NextResponse.json({ data: existing });

      const reportingTime = appUser.reporting_time ?? '09:00';
      const status = attendanceStatus(reportingTime, appUser.check_in_grace_minutes ?? 15, localTime());
      const payload = {
        employee_id: authResult.user.id,
        work_date: workDate,
        reporting_time: reportingTime,
        check_in_at: now.toISOString(),
        status,
      };

      const query = existing?.id
        ? admin.from('attendance_logs').update(payload).eq('id', existing.id)
        : admin.from('attendance_logs').insert(payload);

      const { data, error } = await query.select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data }, { status: existing?.id ? 200 : 201 });
    }

    if (!existing?.id || !existing.check_in_at || existing.check_out_at) {
      return NextResponse.json({ data: existing ?? null });
    }

    const totalHours = Math.max(0, (now.getTime() - new Date(existing.check_in_at).getTime()) / 3_600_000);
    const { data, error } = await admin
      .from('attendance_logs')
      .update({
        check_out_at: now.toISOString(),
        total_hours: Number(totalHours.toFixed(2)),
        status: existing.status === 'late' ? 'late' : 'present',
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  const { supabase, response } = await requireSupabase();
  if (response) return response;

  const { data, error } = await supabase
    .from('attendance_logs')
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
