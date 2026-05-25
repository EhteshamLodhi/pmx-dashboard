import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser, requireUserRole } from '@/server/auth';
import { normalizeWeekdays, type WeekDay } from '@/lib/attendance-calendar';

const DEFAULT_WORKING_DAYS: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DEFAULT_WEEKLY_OFF_DAYS: WeekDay[] = ['saturday', 'sunday'];

function toPolicyResponse(row: Record<string, unknown>) {
  const weeklyOffDays = normalizeWeekdays(row.weekly_off_days, DEFAULT_WEEKLY_OFF_DAYS);
  const workingDays = normalizeWeekdays(
    row.working_days,
    DEFAULT_WORKING_DAYS.filter((day) => !weeklyOffDays.includes(day)),
  );

  return {
    defaultReportingTime: String(row.default_reporting_time ?? '09:00').slice(0, 5),
    checkInGraceMinutes: row.check_in_grace_minutes ?? 15,
    globalReportingTime: String(row.global_reporting_time ?? row.default_reporting_time ?? '09:00').slice(0, 5),
    globalGracePeriod: row.global_grace_period ?? row.check_in_grace_minutes ?? 15,
    checkOutReminderTime: String(row.check_out_reminder_time ?? '19:00').slice(0, 5),
    workingDays,
    weeklyOffDays,
    workWeekEffectiveFrom: String(row.work_week_effective_from ?? new Date().toISOString().split('T')[0]).slice(0, 10),
    sickLeaveDays: row.sick_leave_days ?? 10,
    emergencyLeaveDays: row.emergency_leave_days ?? 5,
    casualLeaveDays: row.casual_leave_days ?? 10,
    annualLeaveDays: row.annual_leave_days ?? 14,
    casualLeaveNoticeHours: row.casual_leave_notice_hours ?? 48,
    annualLeaveNoticeHours: row.annual_leave_notice_hours ?? 48,
    leavePolicyNotes:
      String(
        row.leave_policy_notes ??
          'Sick leave can be used for medical illness or treatment and does not require advance notice.\nEmergency leave can be used for urgent personal or family situations and does not require advance notice.\nCasual leave is for planned short personal time away and requires advance notice.\nAnnual leave is for planned vacations or longer breaks and requires advance notice.',
      ),
  };
}

export async function GET() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response) return authResult.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('attendance_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: toPolicyResponse(data ?? {}) });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin', 'director']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const body = await request.json();
  const weeklyOffDays = normalizeWeekdays(body.weeklyOffDays, DEFAULT_WEEKLY_OFF_DAYS);
  const workingDays = normalizeWeekdays(
    body.workingDays,
    DEFAULT_WORKING_DAYS.filter((day) => !weeklyOffDays.includes(day)),
  );
  const payload = {
    default_reporting_time: body.defaultReportingTime || '09:00',
    check_in_grace_minutes: Number(body.checkInGraceMinutes ?? 15),
    global_reporting_time: body.globalReportingTime || body.defaultReportingTime || '09:00',
    global_grace_period: Number(body.globalGracePeriod ?? body.checkInGraceMinutes ?? 15),
    check_out_reminder_time: body.checkOutReminderTime || '19:00',
    working_days: workingDays,
    weekly_off_days: weeklyOffDays,
    work_week_effective_from: body.workWeekEffectiveFrom || new Date().toISOString().split('T')[0],
    sick_leave_days: Number(body.sickLeaveDays ?? 10),
    emergency_leave_days: Number(body.emergencyLeaveDays ?? 5),
    casual_leave_days: Number(body.casualLeaveDays ?? 10),
    annual_leave_days: Number(body.annualLeaveDays ?? 14),
    casual_leave_notice_hours: Number(body.casualLeaveNoticeHours ?? 48),
    annual_leave_notice_hours: Number(body.annualLeaveNoticeHours ?? 48),
    leave_policy_notes: String(body.leavePolicyNotes ?? '').trim(),
  };

  const { data: existing, error: existingError } = await authResult.admin
    .from('attendance_settings')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const query = existing?.id
    ? authResult.admin.from('attendance_settings').update(payload).eq('id', existing.id)
    : authResult.admin.from('attendance_settings').insert(payload);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
