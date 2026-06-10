import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCreateNotifications, tryCreateRoleNotification } from '@/server/notifications';
import { holidayForDate, isWeeklyOff } from '@/lib/attendance-calendar';
import type { Holiday, PolicySettings } from '@/app/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CHECKOUT_REMINDER_AFTER_HOURS = 9;
const CHECKIN_REMINDER_AFTER_MINUTES = 30;
const REMINDER_REPEAT_MINUTES = 30;
const AUTO_CLOSE_REMARK = 'Auto-closed by reminder engine after missing check-out.';

function minutesFromTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function todayIso() {
  return localNow().toISOString().split('T')[0];
}

function localNow() {
  const now = new Date();
  const offsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? '300');
  return new Date(now.getTime() + offsetMinutes * 60_000);
}

function currentMinutes() {
  const now = localNow();
  return now.getHours() * 60 + now.getMinutes();
}

function reminderRoundByMinutes(nowMinutes: number, thresholdMinutes: number) {
  return Math.max(0, Math.floor((nowMinutes - thresholdMinutes) / REMINDER_REPEAT_MINUTES));
}

function reminderRoundByTimestamp(currentTimestamp: number, thresholdTimestamp: number) {
  return Math.max(0, Math.floor((currentTimestamp - thresholdTimestamp) / (REMINDER_REPEAT_MINUTES * 60_000)));
}

function localDateTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const offsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? '300');
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - offsetMinutes * 60_000);
}

function localDateMinutesToUtc(date: string, minutesFromMidnight: number) {
  const [year, month, day] = date.split('-').map(Number);
  const offsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? '300');
  return new Date(Date.UTC(year, month - 1, day, 0, minutesFromMidnight) - offsetMinutes * 60_000);
}

function resolvedAutoCheckoutTimestamp(workDate: string, checkInAt: string) {
  const expectedCheckout = new Date(new Date(checkInAt).getTime() + CHECKOUT_REMINDER_AFTER_HOURS * 3_600_000);
  const endOfDay = localDateTimeToUtc(workDate, '23:59');
  return new Date(Math.min(expectedCheckout.getTime(), endOfDay.getTime()));
}

function appendAutoCloseRemark(existing?: string | null) {
  if (!existing?.trim()) return AUTO_CLOSE_REMARK;
  if (existing.includes(AUTO_CLOSE_REMARK)) return existing;
  return `${existing}\n${AUTO_CLOSE_REMARK}`;
}

function closedAttendanceStatus(status?: string | null) {
  if (status === 'holiday' || status === 'weekly-off' || status === 'on-leave') return status;
  return status === 'late' ? 'late' : 'present';
}

function hierarchyRecipients(user: {
  line_manager_id?: string | null;
  project_manager_id?: string | null;
  director_id?: string | null;
}) {
  return Array.from(
    new Set([user.line_manager_id, user.project_manager_id, user.director_id].filter(Boolean) as string[]),
  );
}

function reminderResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function providedCronSecret(request: Request) {
  const url = new URL(request.url);
  return (
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-cron-secret') ??
    url.searchParams.get('secret')
  );
}

async function runReminderJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  const providedSecret = providedCronSecret(request);

  if (secret && providedSecret !== secret) {
    console.warn('Reminder run rejected: invalid cron secret.');
    return reminderResponse({ error: 'Unauthorized reminder run.' }, 401);
  }

  const admin = createAdminClient();
  const workDate = todayIso();
  const nowMinutes = currentMinutes();
  const nowTimestamp = Date.now();

  const { data: settings, error: settingsError } = await admin
    .from('attendance_settings')
    .select('check_in_grace_minutes, weekly_off_days')
    .limit(1)
    .maybeSingle();

  if (settingsError) return reminderResponse({ error: settingsError.message }, 500);

  const policy = {
    weeklyOffDays: settings?.weekly_off_days ?? ['saturday', 'sunday'],
  } as PolicySettings;

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, full_name, reporting_time, check_in_grace_minutes, line_manager_id, project_manager_id, director_id, role, is_active')
    .eq('is_active', true);

  if (usersError) return reminderResponse({ error: usersError.message }, 500);

  const { data: holidays, error: holidaysError } = await admin
    .from('holidays')
    .select('id, holiday_name, holiday_date, start_date, end_date, recurring, holiday_type, description');

  if (holidaysError) return reminderResponse({ error: holidaysError.message }, 500);

  const { data: approvedLeaves, error: approvedLeavesError } = await admin
    .from('leave_requests')
    .select('employee_id')
    .eq('status', 'approved')
    .lte('start_date', workDate)
    .gte('end_date', workDate);

  if (approvedLeavesError) return reminderResponse({ error: approvedLeavesError.message }, 500);

  const { data: attendance, error: attendanceError } = await admin
    .from('attendance_logs')
    .select('id, employee_id, work_date, check_in_at, check_out_at, status, remarks');

  if (attendanceError) return reminderResponse({ error: attendanceError.message }, 500);

  const allAttendance = attendance ?? [];
  const staleOpenAttendance = allAttendance.filter((record) =>
    record.work_date < workDate && Boolean(record.check_in_at) && !record.check_out_at,
  );

  let autoClosedCount = 0;
  if (staleOpenAttendance.length > 0) {
    const results = await Promise.all(
      staleOpenAttendance.map(async (record) => {
        const resolvedCheckoutAt = resolvedAutoCheckoutTimestamp(record.work_date, record.check_in_at as string);
        const totalHours = Math.max(
          0,
          (resolvedCheckoutAt.getTime() - new Date(record.check_in_at as string).getTime()) / 3_600_000,
        );

        const { error } = await admin
          .from('attendance_logs')
          .update({
            check_out_at: resolvedCheckoutAt.toISOString(),
            total_hours: Number(totalHours.toFixed(2)),
            status: closedAttendanceStatus(record.status),
            remarks: appendAutoCloseRemark(record.remarks),
          })
          .eq('id', record.id);

        return error ? 0 : 1;
      }),
    );

    autoClosedCount = results.reduce<number>((sum, value) => sum + value, 0);
  }

  const attendanceByUser = new Map(
    allAttendance
      .filter((record) => record.work_date === workDate)
      .map((record) => [record.employee_id, record]),
  );
  const mappedHolidays = (holidays ?? []).map((holiday) => ({
    id: holiday.id,
    name: holiday.holiday_name,
    date: holiday.holiday_date,
    startDate: holiday.start_date ?? holiday.holiday_date,
    endDate: holiday.end_date ?? holiday.start_date ?? holiday.holiday_date,
    recurring: holiday.recurring ?? false,
    type: holiday.holiday_type ?? 'public',
    description: holiday.description ?? undefined,
  })) as Holiday[];
  const holiday = holidayForDate(mappedHolidays, workDate);
  const weeklyOff = isWeeklyOff(workDate, policy);
  const approvedLeaveUserIds = new Set((approvedLeaves ?? []).map((leave) => leave.employee_id));
  const employeeUsers = users ?? [];
  const eligibleReminderUsers = employeeUsers.filter(
    (user) => !holiday && !weeklyOff && !approvedLeaveUserIds.has(user.id),
  );
  const checkInNotifications = eligibleReminderUsers
    .flatMap((user) => {
      const threshold = minutesFromTime(user.reporting_time ?? '09:00') + CHECKIN_REMINDER_AFTER_MINUTES;
      const record = attendanceByUser.get(user.id);
      if (!(nowMinutes >= threshold && !record?.check_in_at && record?.status !== 'on-leave')) return [];
      const round = reminderRoundByMinutes(nowMinutes, threshold);
      return [{
        userId: user.id,
        category: 'attendance' as const,
        title: round === 0 ? 'Check-in reminder' : 'Check-in reminder',
        message: round === 0
          ? 'You have not checked in today.'
          : 'You still have not checked in today. Please mark your attendance.',
        link: '/attendance',
        sourceKey: `check-in:${workDate}:${user.id}:${round}`,
      }];
    });

  const managerCheckInNotifications = eligibleReminderUsers
    .flatMap((user) => {
      const threshold = minutesFromTime(user.reporting_time ?? '09:00') + CHECKIN_REMINDER_AFTER_MINUTES;
      const record = attendanceByUser.get(user.id);
      if (!(nowMinutes >= threshold && !record?.check_in_at && record?.status !== 'on-leave')) return [];
      const round = reminderRoundByMinutes(nowMinutes, threshold);
      return hierarchyRecipients(user).map((recipientId) => ({
        userId: recipientId,
        category: 'attendance' as const,
        title: round === 0 ? 'Employee check-in reminder' : 'Employee check-in reminder',
        message: `${user.full_name} has not checked in today.`,
        link: '/admin/attendance',
        sourceKey: `manager-check-in-reminder:${workDate}:${user.id}:${recipientId}:${round}`,
      }));
    });

  const checkOutNotifications = eligibleReminderUsers
    .flatMap((user) => {
      const record = attendanceByUser.get(user.id);
      if (!(record?.check_in_at && !record?.check_out_at)) return [];
      const thresholdMinutes = minutesFromTime(user.reporting_time ?? '09:00') + CHECKOUT_REMINDER_AFTER_HOURS * 60;
      if (thresholdMinutes > 23 * 60 + 59) return [];
      const thresholdTimestamp = localDateMinutesToUtc(workDate, thresholdMinutes).getTime();
      if (nowTimestamp < thresholdTimestamp) return [];
      const round = reminderRoundByTimestamp(nowTimestamp, thresholdTimestamp);
      return [{
        userId: user.id,
        category: 'attendance' as const,
        title: round === 0 ? 'Check-out reminder' : 'Check-out reminder',
        message: 'You have not checked out today.',
        link: '/attendance',
        sourceKey: `check-out:${workDate}:${user.id}:${round}`,
      }];
    });

  const managerCheckOutNotifications = eligibleReminderUsers
    .flatMap((user) => {
      const record = attendanceByUser.get(user.id);
      if (!(record?.check_in_at && !record?.check_out_at)) return [];
      const thresholdMinutes = minutesFromTime(user.reporting_time ?? '09:00') + CHECKOUT_REMINDER_AFTER_HOURS * 60;
      if (thresholdMinutes > 23 * 60 + 59) return [];
      const thresholdTimestamp = localDateMinutesToUtc(workDate, thresholdMinutes).getTime();
      if (nowTimestamp < thresholdTimestamp) return [];
      const round = reminderRoundByTimestamp(nowTimestamp, thresholdTimestamp);
      return hierarchyRecipients(user).map((recipientId) => ({
        userId: recipientId,
        category: 'attendance' as const,
        title: round === 0 ? 'Employee check-out reminder' : 'Employee check-out reminder',
        message: `${user.full_name} has not checked out today.`,
        link: '/admin/attendance',
        sourceKey: `manager-check-out-reminder:${workDate}:${user.id}:${recipientId}:${round}`,
      }));
    });

  await tryCreateNotifications(admin, [
    ...checkInNotifications,
    ...managerCheckInNotifications,
    ...checkOutNotifications,
    ...managerCheckOutNotifications,
  ]);

  if (checkInNotifications.length > 0) {
    const adminRound = Math.max(
      0,
      ...checkInNotifications.map((notification) => Number(notification.sourceKey?.split(':').at(-1) ?? 0)),
    );
    await tryCreateRoleNotification(admin, ['admin'], {
      category: 'admin',
      title: 'Missing attendance alert',
      message: `${checkInNotifications.length} employee(s) have not checked in today.`,
      link: '/admin/attendance',
      sourceKey: `admin-missing-attendance:${workDate}:${adminRound}`,
    });
  }

  const result = {
    ok: true,
    workDate,
    localTime: localNow().toISOString(),
    activeUsers: employeeUsers.length,
    reminderEligibleUsers: eligibleReminderUsers.length,
    skippedForHoliday: Boolean(holiday),
    skippedForWeeklyOff: weeklyOff,
    approvedLeaveUsers: approvedLeaveUserIds.size,
    openCheckouts: employeeUsers.filter((user) => {
      const record = attendanceByUser.get(user.id);
      return Boolean(record?.check_in_at && !record?.check_out_at);
    }).length,
    checkInReminders: checkInNotifications.length,
    checkOutReminders: checkOutNotifications.length,
    managerCheckInReminders: managerCheckInNotifications.length,
    managerCheckOutReminders: managerCheckOutNotifications.length,
    autoClosedCount,
  };

  console.info('Reminder run completed', result);

  return reminderResponse(result);
}

export async function GET(request: Request) {
  return runReminderJob(request);
}

export async function POST(request: Request) {
  return runReminderJob(request);
}
