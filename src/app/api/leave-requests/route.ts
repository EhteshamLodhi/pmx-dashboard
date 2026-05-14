import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSupabase } from '@/server/responses';
import { requireAuthenticatedUser } from '@/server/auth';
import { tryCreateNotification, tryCreateRoleNotification } from '@/server/notifications';

const leaveTypes = ['sick', 'emergency', 'casual', 'annual'] as const;
type LeaveType = (typeof leaveTypes)[number];

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

function leaveDaysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function leaveAllowance(
  employee: {
    sick_leave_days?: number | null;
    emergency_leave_days?: number | null;
    casual_leave_days?: number | null;
    annual_leave_days?: number | null;
  },
  type: LeaveType,
) {
  if (type === 'sick') return employee.sick_leave_days ?? 10;
  if (type === 'emergency') return employee.emergency_leave_days ?? 5;
  if (type === 'casual') return employee.casual_leave_days ?? 10;
  return employee.annual_leave_days ?? 14;
}

function leaveTypeLabel(type: LeaveType) {
  switch (type) {
    case 'sick':
      return 'sick';
    case 'emergency':
      return 'emergency';
    case 'casual':
      return 'casual';
    case 'annual':
      return 'annual';
  }
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
  if (startDate <= today || endDate < startDate) {
    return NextResponse.json({ error: 'Leave can only be requested for future dates.' }, { status: 400 });
  }

  const { data: settings, error: settingsError } = await admin
    .from('attendance_settings')
    .select('casual_leave_notice_hours, annual_leave_notice_hours')
    .limit(1)
    .maybeSingle();

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  const minimumLeaveNoticeHours =
    leaveType === 'casual'
      ? settings?.casual_leave_notice_hours ?? 48
      : leaveType === 'annual'
        ? settings?.annual_leave_notice_hours ?? 48
        : 0;
  const requestedStart = dateAtLocalMidnight(startDate);
  if (minimumLeaveNoticeHours > 0 && requestedStart.getTime() - localNow().getTime() < minimumLeaveNoticeHours * 3_600_000) {
    return NextResponse.json(
      { error: `${leaveTypeLabel(leaveType)} leave requests require at least ${minimumLeaveNoticeHours} hours notice.` },
      { status: 400 },
    );
  }

  const { data: employee, error: employeeError } = await admin
    .from('users')
    .select('id, full_name, line_manager_id, director_id, sick_leave_days, emergency_leave_days, casual_leave_days, annual_leave_days')
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
  const allowance = leaveAllowance(employee, leaveType);
  const leaveYear = startDate.slice(0, 4);
  const { data: approvedLeaves, error: approvedLeavesError } = await admin
    .from('leave_requests')
    .select('total_days')
    .eq('employee_id', authResult.user.id)
    .eq('leave_type', leaveType)
    .eq('status', 'approved')
    .gte('start_date', `${leaveYear}-01-01`)
    .lte('start_date', `${leaveYear}-12-31`);

  if (approvedLeavesError) return NextResponse.json({ error: approvedLeavesError.message }, { status: 500 });

  const usedDays = (approvedLeaves ?? []).reduce((total, leave) => total + Number(leave.total_days ?? 0), 0);
  if (usedDays + requestedDays > allowance) {
    return NextResponse.json(
      { error: `This request exceeds the available ${leaveType} leave balance of ${Math.max(allowance - usedDays, 0)} day(s).` },
      { status: 400 },
    );
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

  await tryCreateRoleNotification(admin, ['director'], {
    category: 'approval',
    title: 'Leave request submitted',
    message: `${employee.full_name} submitted a ${leaveType} leave request for ${startDate} to ${endDate}.`,
    link: '/approvals',
    sourceKey: `leave-submitted:${data.id}:director`,
  });

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const { leaveId, level, approved, comment } = await request.json();
  if (!leaveId || (level !== 1 && level !== 2) || typeof approved !== 'boolean') {
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

  const { data: workflow, error: workflowError } = await admin
    .from('approval_workflow')
    .select('id, approver_id, approval_level')
    .eq('leave_request_id', leaveId)
    .eq('approval_level', level)
    .maybeSingle();

  if (workflowError || !workflow) {
    return NextResponse.json({ error: 'Approval workflow step was not found.' }, { status: 404 });
  }

  const isAdmin = actor.role === 'admin';
  if (!isAdmin && workflow.approver_id !== authResult.user.id) {
    return NextResponse.json({ error: 'You are not assigned to this approval step.' }, { status: 403 });
  }

  const actedAt = new Date().toISOString();
  const nextStatus = approved ? (level === 1 ? 'pending_director' : 'approved') : 'rejected';

  const { data: leave, error: leaveError } = await admin
    .from('leave_requests')
    .select('employee_id, start_date, end_date')
    .eq('id', leaveId)
    .maybeSingle();

  if (leaveError || !leave) {
    return NextResponse.json({ error: 'Leave request was not found.' }, { status: 404 });
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
    await tryCreateRoleNotification(admin, ['director'], {
      category: 'approval',
      title: 'Director approval pending',
      message: `A leave request for ${leave.start_date} to ${leave.end_date} is waiting for final approval.`,
      link: '/approvals',
      sourceKey: `leave-manager-approved:${leaveId}:director`,
    });
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

  return NextResponse.json({ ok: true });
}
