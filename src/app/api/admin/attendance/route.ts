import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUserRole } from '@/server/auth';
import { createRoleNotification } from '@/server/notifications';

export async function POST(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.authUser) return authResult.response;

  const body = await request.json();
  const admin = createAdminClient();
  const { data, error } = await admin.from('attendance_logs').insert(body).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('audit_logs').insert({
    actor_id: authResult.authUser.id,
    entity_type: 'attendance_log',
    entity_id: data.id,
    action: 'admin_attendance_create',
    before_state: null,
    after_state: data,
  });

  await createRoleNotification(admin, ['admin'], {
    category: 'admin',
    title: 'Attendance entry created',
    message: 'An attendance record was manually created by an admin.',
    link: '/admin/attendance',
    sourceKey: `attendance-create:${data.id}`,
  });

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.authUser) return authResult.response;

  const { id, ...updates } = await request.json();
  const admin = createAdminClient();
  const { data: before } = await admin.from('attendance_logs').select('*').eq('id', id).maybeSingle();
  const { data, error } = await admin
    .from('attendance_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('audit_logs').insert({
    actor_id: authResult.authUser.id,
    entity_type: 'attendance_log',
    entity_id: id,
    action: 'admin_attendance_edit',
    before_state: before ?? null,
    after_state: data,
  });

  await createRoleNotification(admin, ['admin'], {
    category: 'admin',
    title: 'Attendance entry edited',
    message: 'An attendance record was manually corrected by an admin.',
    link: '/admin/attendance',
    sourceKey: `attendance-edit:${id}:${new Date().toISOString()}`,
  });

  return NextResponse.json({ data });
}
