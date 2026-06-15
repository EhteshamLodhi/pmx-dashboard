import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser, requireUserRole } from '@/server/auth';
import { normalizeWeekdays, type WeekDay } from '@/lib/attendance-calendar';
import { defaultPolicySettings } from '@/lib/powermatix-policy';

const DEFAULT_WORKING_DAYS: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DEFAULT_WEEKLY_OFF_DAYS: WeekDay[] = ['saturday', 'sunday'];

function toPolicyResponse(row: Record<string, unknown>) {
  const defaults = defaultPolicySettings();
  const weeklyOffDays = normalizeWeekdays(row.weekly_off_days, DEFAULT_WEEKLY_OFF_DAYS);
  const workingDays = normalizeWeekdays(
    row.working_days,
    DEFAULT_WORKING_DAYS.filter((day) => !weeklyOffDays.includes(day)),
  );

  return {
    policyEffectiveDate: String(row.policy_effective_date ?? defaults.policyEffectiveDate).slice(0, 10),
    defaultReportingTime: String(row.default_reporting_time ?? defaults.defaultReportingTime).slice(0, 5),
    checkInGraceMinutes: row.check_in_grace_minutes ?? defaults.checkInGraceMinutes,
    globalReportingTime: String(row.global_reporting_time ?? row.default_reporting_time ?? defaults.globalReportingTime).slice(0, 5),
    globalGracePeriod: row.global_grace_period ?? row.check_in_grace_minutes ?? defaults.globalGracePeriod,
    checkOutReminderTime: String(row.check_out_reminder_time ?? defaults.checkOutReminderTime).slice(0, 5),
    closingTime: String(row.closing_time ?? row.check_out_reminder_time ?? defaults.closingTime).slice(0, 5),
    workingDays,
    weeklyOffDays,
    workWeekEffectiveFrom: String(row.work_week_effective_from ?? defaults.workWeekEffectiveFrom).slice(0, 10),
    sickLeaveDays: row.sick_leave_days ?? defaults.sickLeaveDays,
    minorSickLeaveDays: row.minor_sick_leave_days ?? defaults.minorSickLeaveDays,
    emergencyLeaveDays: row.emergency_leave_days ?? defaults.emergencyLeaveDays,
    casualLeaveDays: row.casual_leave_days ?? defaults.casualLeaveDays,
    annualLeaveDays: row.annual_leave_days ?? defaults.annualLeaveDays,
    paternityLeaveDays: row.paternity_leave_days ?? defaults.paternityLeaveDays,
    marriageLeaveDays: row.marriage_leave_days ?? defaults.marriageLeaveDays,
    hajjLeaveDays: row.hajj_leave_days ?? defaults.hajjLeaveDays,
    umrahLeaveDays: row.umrah_leave_days ?? defaults.umrahLeaveDays,
    casualSickMonthlyCapDays: row.casual_sick_monthly_cap_days ?? defaults.casualSickMonthlyCapDays,
    lateConversionCount: row.late_conversion_count ?? defaults.lateConversionCount,
    annualLeaveEligibilityMonths: row.annual_leave_eligibility_months ?? defaults.annualLeaveEligibilityMonths,
    casualLeaveNoticeHours: row.casual_leave_notice_hours ?? defaults.casualLeaveNoticeHours,
    annualLeaveNoticeHours: row.annual_leave_notice_hours ?? defaults.annualLeaveNoticeHours,
    annualLeaveNoticeWorkingDays:
      row.annual_leave_notice_working_days ??
      Math.ceil(Number(row.annual_leave_notice_hours ?? defaults.annualLeaveNoticeHours) / 24) ??
      defaults.annualLeaveNoticeWorkingDays,
    leavePolicyNotes:
      String(
        row.leave_policy_notes ??
          defaults.leavePolicyNotes,
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
  const defaults = defaultPolicySettings();
  const weeklyOffDays = normalizeWeekdays(body.weeklyOffDays, DEFAULT_WEEKLY_OFF_DAYS);
  const workingDays = normalizeWeekdays(
    body.workingDays,
    DEFAULT_WORKING_DAYS.filter((day) => !weeklyOffDays.includes(day)),
  );
  const payload = {
    policy_effective_date: body.policyEffectiveDate || defaults.policyEffectiveDate,
    default_reporting_time: body.defaultReportingTime || defaults.defaultReportingTime,
    check_in_grace_minutes: Number(body.checkInGraceMinutes ?? defaults.checkInGraceMinutes),
    global_reporting_time: body.globalReportingTime || body.defaultReportingTime || defaults.globalReportingTime,
    global_grace_period: Number(body.globalGracePeriod ?? body.checkInGraceMinutes ?? defaults.globalGracePeriod),
    check_out_reminder_time: body.checkOutReminderTime || body.closingTime || defaults.checkOutReminderTime,
    closing_time: body.closingTime || body.checkOutReminderTime || defaults.closingTime,
    working_days: workingDays,
    weekly_off_days: weeklyOffDays,
    work_week_effective_from: body.workWeekEffectiveFrom || defaults.workWeekEffectiveFrom,
    sick_leave_days: Number(body.sickLeaveDays ?? defaults.sickLeaveDays),
    minor_sick_leave_days: Number(body.minorSickLeaveDays ?? defaults.minorSickLeaveDays),
    emergency_leave_days: Number(body.emergencyLeaveDays ?? defaults.emergencyLeaveDays),
    casual_leave_days: Number(body.casualLeaveDays ?? defaults.casualLeaveDays),
    annual_leave_days: Number(body.annualLeaveDays ?? defaults.annualLeaveDays),
    paternity_leave_days: Number(body.paternityLeaveDays ?? defaults.paternityLeaveDays),
    marriage_leave_days: Number(body.marriageLeaveDays ?? defaults.marriageLeaveDays),
    hajj_leave_days: Number(body.hajjLeaveDays ?? defaults.hajjLeaveDays),
    umrah_leave_days: Number(body.umrahLeaveDays ?? defaults.umrahLeaveDays),
    casual_sick_monthly_cap_days: Number(body.casualSickMonthlyCapDays ?? defaults.casualSickMonthlyCapDays),
    late_conversion_count: Number(body.lateConversionCount ?? defaults.lateConversionCount),
    annual_leave_eligibility_months: Number(body.annualLeaveEligibilityMonths ?? defaults.annualLeaveEligibilityMonths),
    casual_leave_notice_hours: Number(body.casualLeaveNoticeHours ?? defaults.casualLeaveNoticeHours),
    annual_leave_notice_hours: Number(body.annualLeaveNoticeHours ?? defaults.annualLeaveNoticeHours),
    annual_leave_notice_working_days: Number(body.annualLeaveNoticeWorkingDays ?? defaults.annualLeaveNoticeWorkingDays),
    leave_policy_notes: String(body.leavePolicyNotes ?? '').trim(),
  };

  const { data: existing, error: existingError } = await authResult.admin
    .from('attendance_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const query = existing?.id
    ? authResult.admin.from('attendance_settings').update(payload).eq('id', existing.id)
    : authResult.admin.from('attendance_settings').insert(payload);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await authResult.admin.from('audit_logs').insert({
    actor_id: authResult.appUser?.id,
    entity_type: 'attendance_settings',
    entity_id: existing?.id ?? null,
    action: 'policy_settings_update',
    before_state: existing ?? null,
    after_state: payload,
  });

  return NextResponse.json({ ok: true });
}
