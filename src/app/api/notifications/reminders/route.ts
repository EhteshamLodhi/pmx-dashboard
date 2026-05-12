import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotifications, createRoleNotification } from '@/server/notifications';

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

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret && providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized reminder run.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const workDate = todayIso();
  const nowMinutes = currentMinutes();

  const { data: settings, error: settingsError } = await admin
    .from('attendance_settings')
    .select('check_in_grace_minutes, check_out_reminder_time')
    .limit(1)
    .maybeSingle();

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  const graceMinutes = settings?.check_in_grace_minutes ?? 15;
  const checkoutReminderTime = settings?.check_out_reminder_time ?? '19:00';

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, full_name, reporting_time, check_in_grace_minutes, check_out_reminder_time, role, is_active')
    .eq('is_active', true);

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const { data: attendance, error: attendanceError } = await admin
    .from('attendance_logs')
    .select('employee_id, check_in_at, check_out_at, status')
    .eq('work_date', workDate);

  if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });

  const attendanceByUser = new Map((attendance ?? []).map((record) => [record.employee_id, record]));
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

  const checkOutNotifications = employeeUsers
    .filter((user) => {
      const record = attendanceByUser.get(user.id);
      const userCheckoutReminderTime = user.check_out_reminder_time ?? checkoutReminderTime;
      return nowMinutes >= minutesFromTime(userCheckoutReminderTime) && Boolean(record?.check_in_at) && !record?.check_out_at;
    })
    .map((user) => ({
      userId: user.id,
      category: 'attendance' as const,
      title: 'Check-out reminder',
      message: 'You forgot to check out today.',
      link: '/attendance',
      sourceKey: `check-out:${workDate}:${user.id}`,
    }));

  await createNotifications(admin, [...checkInNotifications, ...checkOutNotifications]);

  if (checkInNotifications.length > 0) {
    await createRoleNotification(admin, ['admin'], {
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
  });
}
