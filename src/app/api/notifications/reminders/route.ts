import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCreateNotifications, tryCreateRoleNotification } from '@/server/notifications';

const CHECKOUT_REMINDER_AFTER_HOURS = 9;
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

function reminderRoundByTimestamp(currentTimestamp: number, thresholdTimestamp: number) {
  return Math.max(0, Math.floor((currentTimestamp - thresholdTimestamp) / 3_600_000));
}

function localDateTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const offsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? '300');
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - offsetMinutes * 60_000);
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

function hierarchyRecipients(user: {
  line_manager_id?: string | null;
  project_manager_id?: string | null;
  director_id?: string | null;
}) {
  return Array.from(
    new Set([user.line_manager_id, user.project_manager_id, user.director_id].filter(Boolean) as string[]),
  );
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret && providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized reminder run.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const workDate = todayIso();
  const nowMinutes = currentMinutes();
  const nowTimestamp = Date.now();

  const { data: settings, error: settingsError } = await admin
    .from('attendance_settings')
    .select('check_in_grace_minutes')
    .limit(1)
    .maybeSingle();

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  const graceMinutes = settings?.check_in_grace_minutes ?? 15;

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, full_name, reporting_time, check_in_grace_minutes, line_manager_id, project_manager_id, director_id, role, is_active')
    .eq('is_active', true);

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const { data: attendance, error: attendanceError } = await admin
    .from('attendance_logs')
    .select('id, employee_id, work_date, check_in_at, check_out_at, status, remarks');

  if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });

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
            status: record.status === 'late' ? 'late' : 'present',
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
  const employeeUsers = (users ?? []).filter((user) => user.role !== 'admin');
  const checkInNotifications = employeeUsers
    .filter((user) => {
      const userGraceMinutes = user.check_in_grace_minutes ?? graceMinutes;
      const threshold = minutesFromTime(user.reporting_time ?? '09:00') + userGraceMinutes;
      const record = attendanceByUser.get(user.id);
      return nowMinutes >= threshold && !record?.check_in_at && record?.status !== 'on-leave';
    })
    .map((user) => ({
      userId: user.id,
      category: 'attendance' as const,
      title: 'Check-in reminder',
      message: 'You have not checked in today.',
      link: '/attendance',
      sourceKey: `check-in:${workDate}:${user.id}`,
    }));

  const managerCheckInNotifications = employeeUsers
    .flatMap((user) => {
      const userGraceMinutes = user.check_in_grace_minutes ?? graceMinutes;
      const threshold = minutesFromTime(user.reporting_time ?? '09:00') + userGraceMinutes;
      const record = attendanceByUser.get(user.id);
      if (!(nowMinutes >= threshold && !record?.check_in_at && record?.status !== 'on-leave')) return [];
      return hierarchyRecipients(user).map((recipientId) => ({
        userId: recipientId,
        category: 'attendance' as const,
        title: 'Employee check-in reminder',
        message: `${user.full_name} has not checked in today.`,
        link: '/admin/attendance',
        sourceKey: `manager-check-in-reminder:${workDate}:${user.id}:${recipientId}`,
      }));
    });

  const checkOutNotifications = employeeUsers
    .flatMap((user) => {
      const record = attendanceByUser.get(user.id);
      if (!(record?.check_in_at && !record?.check_out_at)) return [];
      const thresholdTimestamp = new Date(record.check_in_at).getTime() + CHECKOUT_REMINDER_AFTER_HOURS * 3_600_000;
      if (nowTimestamp < thresholdTimestamp) return [];
      const round = reminderRoundByTimestamp(nowTimestamp, thresholdTimestamp);
      return [{
        userId: user.id,
        category: 'attendance' as const,
        title: round === 0 ? 'Check-out reminder' : 'Hourly check-out reminder',
        message: round === 0
          ? 'You have completed 9 hours from your check-in time. Please mark your check-out.'
          : 'You are still checked in more than 9 hours after arrival. Please mark your check-out when you leave.',
        link: '/attendance',
        sourceKey: `check-out:${workDate}:${user.id}:${round}`,
      }];
    });

  const managerCheckOutNotifications = employeeUsers
    .flatMap((user) => {
      const record = attendanceByUser.get(user.id);
      if (!(record?.check_in_at && !record?.check_out_at)) return [];
      const thresholdTimestamp = new Date(record.check_in_at).getTime() + CHECKOUT_REMINDER_AFTER_HOURS * 3_600_000;
      if (nowTimestamp < thresholdTimestamp) return [];
      const round = reminderRoundByTimestamp(nowTimestamp, thresholdTimestamp);
      return hierarchyRecipients(user).map((recipientId) => ({
        userId: recipientId,
        category: 'attendance' as const,
        title: round === 0 ? 'Employee check-out reminder' : 'Employee hourly check-out reminder',
        message: `${user.full_name} is still checked in more than 9 hours after arrival and has not checked out yet.`,
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
    await tryCreateRoleNotification(admin, ['admin'], {
      category: 'admin',
      title: 'Missing attendance alert',
      message: `${checkInNotifications.length} employee(s) have not checked in today.`,
      link: '/admin/attendance',
      sourceKey: `admin-missing-attendance:${workDate}`,
    });
  }

  return NextResponse.json({
    ok: true,
    checkInReminders: checkInNotifications.length,
    checkOutReminders: checkOutNotifications.length,
    managerCheckInReminders: managerCheckInNotifications.length,
    managerCheckOutReminders: managerCheckOutNotifications.length,
    autoClosedCount,
  });
}
