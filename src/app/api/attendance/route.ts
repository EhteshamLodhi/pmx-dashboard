import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser } from '@/server/auth';
import { requireSupabase } from '@/server/responses';
import { tryCreateNotification, tryCreateRoleNotification } from '@/server/notifications';
import { formatDisplayTime } from '@/lib/time';
import { holidayForDate, isWeeklyOff } from '@/lib/attendance-calendar';
import type { AttendanceStatus, Holiday, PolicySettings } from '@/app/types';

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

function preserveNonWorkingStatus(status: string): AttendanceStatus {
  if (status === 'holiday' || status === 'weekly-off' || status === 'on-leave') return status;
  return status === 'late' ? 'late' : 'present';
}

export async function GET() {
  const { supabase, response } = await requireSupabase();
  if (response) return response;

  const { data, error } = await supabase
    .from('attendance_logs')
    .select('*, users:employee_id(full_name, email, project_id, reporting_time)')
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
      .select('id, full_name, reporting_time, check_in_grace_minutes, line_manager_id, is_active')
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

      const [{ data: settings }, { data: holidays }, { data: approvedLeave }] = await Promise.all([
        admin.from('attendance_settings').select('weekly_off_days').limit(1).maybeSingle(),
        admin.from('holidays').select('id, holiday_name, holiday_date, recurring, holiday_type, description'),
        admin
          .from('leave_requests')
          .select('id')
          .eq('employee_id', authResult.user.id)
          .eq('status', 'approved')
          .lte('start_date', workDate)
          .gte('end_date', workDate)
          .maybeSingle(),
      ]);
      const policy = {
        weeklyOffDays: settings?.weekly_off_days ?? ['saturday', 'sunday'],
      } as PolicySettings;
      const mappedHolidays = (holidays ?? []).map((holiday) => ({
        id: holiday.id,
        name: holiday.holiday_name,
        date: holiday.holiday_date,
        recurring: holiday.recurring ?? false,
        type: holiday.holiday_type ?? 'public',
        description: holiday.description ?? undefined,
      })) as Holiday[];
      const nonWorkingStatus: AttendanceStatus | null = holidayForDate(mappedHolidays, workDate)
        ? 'holiday'
        : isWeeklyOff(workDate, policy)
          ? 'weekly-off'
          : approvedLeave
            ? 'on-leave'
            : null;
      const reportingTime = appUser.reporting_time ?? '09:00';
      const status = nonWorkingStatus ?? attendanceStatus(reportingTime, appUser.check_in_grace_minutes ?? 15, localTime());
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

      const checkInTime = localTime();
      if (appUser.line_manager_id) {
        await tryCreateNotification(admin, {
          userId: appUser.line_manager_id,
          category: 'attendance',
          title: `${appUser.full_name} checked in`,
          message: `${appUser.full_name} checked in at ${formatDisplayTime(checkInTime)}.${status === 'late' ? ' Marked late.' : ''}`,
          link: '/admin/attendance',
          sourceKey: `manager-check-in:${workDate}:${authResult.user.id}:${appUser.line_manager_id}`,
        });
      }

      await tryCreateRoleNotification(admin, ['director'], {
        category: 'attendance',
        title: 'Employee check-in recorded',
        message: `${appUser.full_name} checked in at ${formatDisplayTime(checkInTime)}.${status === 'late' ? ' Marked late.' : ''}`,
        link: '/admin/attendance',
        sourceKey: `director-check-in:${workDate}:${authResult.user.id}`,
      });

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
        status: preserveNonWorkingStatus(existing.status),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const checkOutTime = localTime();
    if (appUser.line_manager_id) {
      await tryCreateNotification(admin, {
        userId: appUser.line_manager_id,
        category: 'attendance',
        title: `${appUser.full_name} checked out`,
        message: `${appUser.full_name} checked out at ${formatDisplayTime(checkOutTime)} after ${Number(totalHours.toFixed(2))} hour(s).`,
        link: '/admin/attendance',
        sourceKey: `manager-check-out:${workDate}:${authResult.user.id}:${appUser.line_manager_id}`,
      });
    }

    await tryCreateRoleNotification(admin, ['director'], {
      category: 'attendance',
      title: 'Employee check-out recorded',
      message: `${appUser.full_name} checked out at ${formatDisplayTime(checkOutTime)} after ${Number(totalHours.toFixed(2))} hour(s).`,
      link: '/admin/attendance',
      sourceKey: `director-check-out:${workDate}:${authResult.user.id}`,
    });

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
