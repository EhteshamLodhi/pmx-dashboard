import { NextResponse } from 'next/server';
import { requireUserRole } from '@/server/auth';

function toPolicyResponse(row: Record<string, unknown>) {
  return {
    checkInGraceMinutes: row.check_in_grace_minutes ?? 15,
    checkOutReminderTime: String(row.check_out_reminder_time ?? '19:00').slice(0, 5),
    minimumLeaveNoticeHours: row.minimum_leave_notice_hours ?? 48,
    sickLeaveDays: row.sick_leave_days ?? 10,
    casualLeaveDays: row.casual_leave_days ?? 10,
    annualLeaveDays: row.annual_leave_days ?? 14,
  };
}

export async function GET() {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const { data, error } = await authResult.admin
    .from('attendance_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: toPolicyResponse(data ?? {}) });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const body = await request.json();
  const payload = {
    check_in_grace_minutes: Number(body.checkInGraceMinutes ?? 15),
    check_out_reminder_time: body.checkOutReminderTime || '19:00',
    minimum_leave_notice_hours: Number(body.minimumLeaveNoticeHours ?? 48),
    sick_leave_days: Number(body.sickLeaveDays ?? 10),
    casual_leave_days: Number(body.casualLeaveDays ?? 10),
    annual_leave_days: Number(body.annualLeaveDays ?? 14),
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
