import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSupabase } from '@/server/responses';
import { requireAuthenticatedUser } from '@/server/auth';
import { tryCreateNotification, tryCreateRoleNotification } from '@/server/notifications';
import type { LeaveType, PolicySettings } from '@/app/types';
import { defaultPolicySettings, getLeaveTypeLabel, LEAVE_TYPES } from '@/lib/powermatix-policy';

const leaveTypes: LeaveType[] = [...LEAVE_TYPES, 'sick'];
const CASUAL_SICK_TYPES: LeaveType[] = ['casual', 'minor_sick', 'sick'];

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

function dateAtLocalMidnight(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function leaveDaysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function isWeekday(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function workingDaysUntil(startDate: string) {
  const start = dateAtLocalMidnight(localDateIso());
  const end = dateAtLocalMidnight(startDate);
  let days = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor < end) {
    if (isWeekday(cursor)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function completedServiceMonths(joinDate: string | null | undefined, onDate: string) {
  if (!joinDate) return 0;
  const joined = dateAtLocalMidnight(joinDate);
  const target = dateAtLocalMidnight(onDate);
  if (Number.isNaN(joined.getTime()) || Number.isNaN(target.getTime())) return 0;
  let months = (target.getFullYear() - joined.getFullYear()) * 12 + target.getMonth() - joined.getMonth();
  if (target.getDate() < joined.getDate()) months -= 1;
  return Math.max(0, months);
}

function monthBounds(date: string) {
  const [year, month] = date.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

function policyFromSettings(settings?: Record<string, unknown> | null): PolicySettings {
  const defaults = defaultPolicySettings();
  return {
    ...defaults,
    annualLeaveDays: toNumber(settings?.annual_leave_days, defaults.annualLeaveDays),
    casualLeaveDays: toNumber(settings?.casual_leave_days, defaults.casualLeaveDays),
    sickLeaveDays: toNumber(settings?.sick_leave_days, defaults.sickLeaveDays),
    minorSickLeaveDays: toNumber(settings?.minor_sick_leave_days, defaults.minorSickLeaveDays),
    emergencyLeaveDays: toNumber(settings?.emergency_leave_days, defaults.emergencyLeaveDays),
    paternityLeaveDays: toNumber(settings?.paternity_leave_days, defaults.paternityLeaveDays),
    marriageLeaveDays: toNumber(settings?.marriage_leave_days, defaults.marriageLeaveDays),
    hajjLeaveDays: toNumber(settings?.hajj_leave_days, defaults.hajjLeaveDays),
    umrahLeaveDays: toNumber(settings?.umrah_leave_days, defaults.umrahLeaveDays),
    casualSickMonthlyCapDays: toNumber(settings?.casual_sick_monthly_cap_days, defaults.casualSickMonthlyCapDays),
    annualLeaveEligibilityMonths: toNumber(settings?.annual_leave_eligibility_months, defaults.annualLeaveEligibilityMonths),
    casualLeaveNoticeHours: toNumber(settings?.casual_leave_notice_hours, defaults.casualLeaveNoticeHours),
    annualLeaveNoticeHours: toNumber(settings?.annual_leave_notice_hours, defaults.annualLeaveNoticeHours),
    annualLeaveNoticeWorkingDays: toNumber(
      settings?.annual_leave_notice_working_days,
      Math.ceil(toNumber(settings?.annual_leave_notice_hours, defaults.annualLeaveNoticeHours) / 24),
    ),
  };
}

function leaveAllowance(
  employee: {
    sick_leave_days?: number | null;
    minor_sick_leave_days?: number | null;
    emergency_leave_days?: number | null;
    casual_leave_days?: number | null;
    annual_leave_days?: number | null;
    paternity_leave_days?: number | null;
    marriage_leave_days?: number | null;
    hajj_leave_days?: number | null;
    umrah_leave_days?: number | null;
  },
  type: LeaveType,
  policy: PolicySettings,
) {
  if (type === 'annual') return employee.annual_leave_days ?? policy.annualLeaveDays;
  if (type === 'casual' || type === 'minor_sick' || type === 'sick') return employee.casual_leave_days ?? policy.casualLeaveDays;
  if (type === 'emergency') return employee.emergency_leave_days ?? policy.emergencyLeaveDays;
  if (type === 'paternity') return employee.paternity_leave_days ?? policy.paternityLeaveDays;
  if (type === 'marriage') return employee.marriage_leave_days ?? policy.marriageLeaveDays;
  if (type === 'hajj') return employee.hajj_leave_days ?? policy.hajjLeaveDays;
  return employee.umrah_leave_days ?? policy.umrahLeaveDays;
}

function requestedTypesForBalance(type: LeaveType) {
  return CASUAL_SICK_TYPES.includes(type) ? CASUAL_SICK_TYPES : [type];
}

export async function GET() {
  const { supabase, response } = await requireSupabase();
  if (response) return response;

  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, approval_workflow(*)')
    .order('submitted_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const body = await request.json();
  const admin = createAdminClient();
  const { type, startDate, endDate, reason } = body as {
    type?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  };

  if (!type || !leaveTypes.includes(type as LeaveType) || !startDate || !endDate || !reason?.trim()) {
    return NextResponse.json({ error: 'Leave type, dates, and reason are required.' }, { status: 400 });
  }

  const leaveType = type as LeaveType;
  const today = localDateIso();
  const sameDayAllowed = leaveType === 'emergency';
  if ((!sameDayAllowed && startDate <= today) || (sameDayAllowed && startDate < today) || endDate < startDate) {
    return NextResponse.json(
      { error: sameDayAllowed ? 'Emergency leave can be requested from today onward.' : 'Leave can only be requested for future dates.' },
      { status: 400 },
    );
  }

  const { data: settings, error: settingsError } = await admin
    .from('attendance_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });
  const policy = policyFromSettings(settings as Record<string, unknown> | null);

  const minimumLeaveNoticeHours =
    leaveType === 'casual'
      ? policy.casualLeaveNoticeHours
      : 0;
  const requestedStart = dateAtLocalMidnight(startDate);
  if (minimumLeaveNoticeHours > 0 && requestedStart.getTime() - localNow().getTime() < minimumLeaveNoticeHours * 3_600_000) {
    return NextResponse.json(
      { error: `${getLeaveTypeLabel(leaveType)} requests require at least ${minimumLeaveNoticeHours} hours notice.` },
      { status: 400 },
    );
  }

  if (leaveType === 'annual' && workingDaysUntil(startDate) < policy.annualLeaveNoticeWorkingDays) {
    return NextResponse.json(
      { error: `Annual leave requests require at least ${policy.annualLeaveNoticeWorkingDays} working days notice.` },
      { status: 400 },
    );
  }

  const { data: employee, error: employeeError } = await admin
    .from('users')
    .select('id, full_name, joined_at, line_manager_id, director_id, sick_leave_days, minor_sick_leave_days, emergency_leave_days, casual_leave_days, annual_leave_days, paternity_leave_days, marriage_leave_days, hajj_leave_days, umrah_leave_days')
    .eq('id', authResult.user.id)
    .maybeSingle();

  if (employeeError || !employee) {
    return NextResponse.json({ error: 'Employee profile is not configured yet.' }, { status: 400 });
  }

  if (!employee.line_manager_id || !employee.director_id) {
    return NextResponse.json(
      { error: 'Your reporting hierarchy is incomplete. Ask an admin to assign a line manager and director.' },
      { status: 400 },
    );
  }

  const requestedDays = leaveDaysBetween(startDate, endDate);
  if (leaveType === 'annual' && completedServiceMonths(employee.joined_at, startDate) < policy.annualLeaveEligibilityMonths) {
    return NextResponse.json(
      { error: `Annual leave is available after ${policy.annualLeaveEligibilityMonths} months of continuous service.` },
      { status: 400 },
    );
  }

  const allowance = leaveAllowance(employee, leaveType, policy);
  const leaveYear = startDate.slice(0, 4);
  const balanceTypes = requestedTypesForBalance(leaveType);
  const { data: yearlyLeaves, error: approvedLeavesError } = await admin
    .from('leave_requests')
    .select('total_days, status')
    .eq('employee_id', authResult.user.id)
    .in('leave_type', balanceTypes)
    .neq('status', 'rejected')
    .gte('start_date', `${leaveYear}-01-01`)
    .lte('start_date', `${leaveYear}-12-31`);

  if (approvedLeavesError) return NextResponse.json({ error: approvedLeavesError.message }, { status: 500 });

  const usedDays = (yearlyLeaves ?? []).reduce((total, leave) => total + Number(leave.total_days ?? 0), 0);
  if (leaveType !== 'umrah' && usedDays + requestedDays > allowance) {
    return NextResponse.json(
      { error: `This request exceeds the available ${getLeaveTypeLabel(leaveType).toLowerCase()} balance of ${Math.max(allowance - usedDays, 0)} day(s).` },
      { status: 400 },
    );
  }

  if (CASUAL_SICK_TYPES.includes(leaveType)) {
    const bounds = monthBounds(startDate);
    const { data: monthLeaves, error: monthLeavesError } = await admin
      .from('leave_requests')
      .select('total_days')
      .eq('employee_id', authResult.user.id)
      .in('leave_type', CASUAL_SICK_TYPES)
      .neq('status', 'rejected')
      .gte('start_date', bounds.start)
      .lte('start_date', bounds.end);

    if (monthLeavesError) return NextResponse.json({ error: monthLeavesError.message }, { status: 500 });

    const monthUsed = (monthLeaves ?? []).reduce((total, leave) => total + Number(leave.total_days ?? 0), 0);
    if (monthUsed + requestedDays > policy.casualSickMonthlyCapDays) {
      return NextResponse.json(
        { error: `Casual and minor sick leave are limited to ${policy.casualSickMonthlyCapDays} day(s) per month unless admin approves an override.` },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin
    .from('leave_requests')
    .insert({
      employee_id: authResult.user.id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
      status: 'pending_manager',
    })
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Unable to create leave request.' }, { status: 400 });

  const { error: workflowError } = await admin.from('approval_workflow').insert([
    {
      leave_request_id: data.id,
      approval_level: 1,
      approver_id: employee.line_manager_id,
      approver_role: 'Line Manager',
      status: 'pending',
    },
    {
      leave_request_id: data.id,
      approval_level: 2,
      approver_id: employee.director_id,
      approver_role: 'Director',
      status: 'pending',
    },
  ]);

  if (workflowError) {
    await admin.from('leave_requests').delete().eq('id', data.id);
    return NextResponse.json({ error: workflowError.message }, { status: 400 });
  }

  await tryCreateNotification(admin, {
    userId: employee.line_manager_id,
    category: 'approval',
    title: 'Leave approval pending',
    message: 'A leave request is waiting for your line manager approval.',
    link: '/approvals',
    sourceKey: `leave-submitted:${data.id}:manager`,
  });

  await tryCreateRoleNotification(admin, ['admin'], {
    category: 'approval',
    title: 'Leave request submitted',
    message: `${employee.full_name ?? 'An employee'} submitted a leave request for ${startDate} to ${endDate}.`,
    link: '/approvals',
    sourceKey: `leave-submitted:${data.id}:admin`,
  });

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const { leaveId, level, approved, comment } = await request.json();
  if (!leaveId || ![1, 2].includes(level) || typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'Invalid approval payload.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: actor, error: actorError } = await admin
    .from('users')
    .select('id, role')
    .eq('id', authResult.user.id)
    .maybeSingle();

  if (actorError || !actor) {
    return NextResponse.json({ error: 'Approver profile is not configured.' }, { status: 400 });
  }

  const { data: workflowSteps, error: workflowError } = await admin
    .from('approval_workflow')
    .select('id, approver_id, approver_role, approval_level, status')
    .eq('leave_request_id', leaveId)
    .order('approval_level');

  if (workflowError || !workflowSteps?.length) {
    return NextResponse.json({ error: 'Approval workflow step was not found.' }, { status: 404 });
  }

  const activeWorkflowSteps = workflowSteps.filter(
    (step) => !String(step.approver_role ?? '').toLowerCase().includes('project manager'),
  );
  const workflow = activeWorkflowSteps.find(
    (step) =>
      step.approval_level === level ||
      (level === 2 && String(step.approver_role ?? '').toLowerCase().includes('director')),
  );
  if (!workflow) {
    return NextResponse.json({ error: 'Approval workflow step was not found.' }, { status: 404 });
  }

  if (workflow.approver_id !== authResult.user.id) {
    return NextResponse.json({ error: 'You are not assigned to this approval step.' }, { status: 403 });
  }

  if (workflow.status !== 'pending') {
    return NextResponse.json({ error: 'This approval step has already been completed.' }, { status: 400 });
  }

  const previousSteps = activeWorkflowSteps.filter((step) => {
    const normalizedLevel = String(step.approver_role ?? '').toLowerCase().includes('director')
      ? 2
      : step.approval_level;
    return normalizedLevel < level;
  });
  if (previousSteps.some((step) => step.status !== 'approved')) {
    return NextResponse.json({ error: 'Previous approval steps must be completed first.' }, { status: 400 });
  }

  const actedAt = new Date().toISOString();
  const nextStatus =
    approved
      ? level === 1
        ? 'pending_director'
        : 'approved'
      : 'rejected';

  const { data: leave, error: leaveError } = await admin
    .from('leave_requests')
    .select('employee_id, start_date, end_date')
    .eq('id', leaveId)
    .maybeSingle();

  if (leaveError || !leave) {
    return NextResponse.json({ error: 'Leave request was not found.' }, { status: 404 });
  }

  const { data: employeeProfile, error: employeeProfileError } = await admin
    .from('users')
    .select('full_name, director_id')
    .eq('id', leave.employee_id)
    .maybeSingle();

  if (employeeProfileError || !employeeProfile) {
    return NextResponse.json({ error: 'Employee profile is not configured yet.' }, { status: 400 });
  }

  const { error: updateWorkflowError } = await admin
    .from('approval_workflow')
    .update({
      status: approved ? 'approved' : 'rejected',
      comment: typeof comment === 'string' ? comment.trim() || null : null,
      acted_at: actedAt,
    })
    .eq('id', workflow.id);

  if (updateWorkflowError) {
    return NextResponse.json({ error: updateWorkflowError.message }, { status: 400 });
  }

  const { error: updateLeaveError } = await admin
    .from('leave_requests')
    .update({
      status: nextStatus,
      decided_at: nextStatus === 'approved' || nextStatus === 'rejected' ? actedAt : null,
    })
    .eq('id', leaveId);

  if (updateLeaveError) {
    return NextResponse.json({ error: updateLeaveError.message }, { status: 400 });
  }

  if (approved && level === 1) {
    const directorId = employeeProfile.director_id;
    if (directorId) {
      await tryCreateNotification(admin, {
        userId: directorId,
        category: 'approval',
        title: 'Director approval pending',
        message: `A leave request for ${leave.start_date} to ${leave.end_date} is waiting for your review.`,
        link: '/approvals',
        sourceKey: `leave-line-manager-approved:${leaveId}:director`,
      });
    }
  }

  if (!approved || level === 2) {
    await tryCreateNotification(admin, {
      userId: leave.employee_id,
      category: 'leave',
      title: approved ? 'Leave request approved' : 'Leave request rejected',
      message: approved
        ? `Your leave request for ${leave.start_date} to ${leave.end_date} was approved.`
        : `Your leave request for ${leave.start_date} to ${leave.end_date} was rejected.`,
      link: '/leave',
      sourceKey: `leave-final:${leaveId}:${approved ? 'approved' : 'rejected'}`,
    });
  }

  await tryCreateRoleNotification(admin, ['admin'], {
    category: 'approval',
    title: approved ? 'Leave approval updated' : 'Leave request rejected',
    message: `${employeeProfile.full_name ?? 'An employee'}'s leave request for ${leave.start_date} to ${leave.end_date} was ${approved ? 'approved at step ' + level : 'rejected'}.`,
    link: '/approvals',
    sourceKey: `leave-admin-update:${leaveId}:${level}:${approved ? 'approved' : 'rejected'}`,
  });

  if (!approved) {
    const directorId = employeeProfile.director_id;
    if (level === 1 && directorId) {
      await tryCreateNotification(admin, {
        userId: directorId,
        category: 'approval',
        title: 'Leave request rejected',
        message: `${employeeProfile.full_name ?? 'An employee'}'s leave request was rejected at line manager stage.`,
        link: '/approvals',
        sourceKey: `leave-rejected:${leaveId}:director`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const url = new URL(request.url);
  const leaveId = url.searchParams.get('leaveId') ?? String((await request.json().catch(() => ({}))).leaveId ?? '');
  if (!leaveId) {
    return NextResponse.json({ error: 'Leave request id is required.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: leave, error: leaveError } = await admin
    .from('leave_requests')
    .select('id, employee_id, status')
    .eq('id', leaveId)
    .maybeSingle();

  if (leaveError || !leave) {
    return NextResponse.json({ error: 'Leave request was not found.' }, { status: 404 });
  }

  if (leave.employee_id !== authResult.user.id) {
    return NextResponse.json({ error: 'You can only delete your own leave requests.' }, { status: 403 });
  }

  if (!['pending_manager', 'pending_project_manager', 'pending_director'].includes(leave.status)) {
    return NextResponse.json({ error: 'Only pending leave requests can be deleted.' }, { status: 400 });
  }

  await admin.from('notifications').delete().ilike('source_key', `%${leaveId}%`);

  const { error } = await admin.from('leave_requests').delete().eq('id', leaveId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
