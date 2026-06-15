import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUserRole } from '@/server/auth';
import { tryCreateRoleNotification } from '@/server/notifications';
import type { UserRole } from '@/app/types';

type AppUser = {
  id: string;
  role: UserRole;
  email: string;
  full_name: string;
};

async function canEditEmployeeAttendance(admin: ReturnType<typeof createAdminClient>, actor: AppUser, employeeId?: string | null) {
  if (!employeeId) return false;
  if (actor.role === 'admin') return true;
  if (actor.role !== 'manager') return false;
  if (employeeId === actor.id) return true;

  const { data: employee } = await admin
    .from('users')
    .select('id, line_manager_id, project_manager_id')
    .eq('id', employeeId)
    .maybeSingle();

  return employee?.line_manager_id === actor.id || employee?.project_manager_id === actor.id;
}

export async function POST(request: Request) {
  const authResult = await requireUserRole(['admin', 'manager']);
  if (authResult.response || !authResult.authUser || !authResult.appUser) return authResult.response;

  const body = await request.json();
  const admin = createAdminClient();

  const allowed = await canEditEmployeeAttendance(admin, authResult.appUser as AppUser, body.employee_id);
  if (!allowed) {
    return NextResponse.json({ error: 'You can only edit attendance records for employees in your team.' }, { status: 403 });
  }

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

  await tryCreateRoleNotification(admin, ['admin'], {
    category: 'admin',
    title: 'Attendance entry created',
    message: `An attendance record was manually created by ${authResult.appUser.full_name}.`,
    link: '/admin/attendance',
    sourceKey: `attendance-create:${data.id}`,
  });

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin', 'manager']);
  if (authResult.response || !authResult.authUser || !authResult.appUser) return authResult.response;

  const { id, ...updates } = await request.json();
  const admin = createAdminClient();
  const { data: before } = await admin.from('attendance_logs').select('*').eq('id', id).maybeSingle();

  if (!before) return NextResponse.json({ error: 'Attendance record not found.' }, { status: 404 });

  const targetEmployeeId = updates.employee_id ?? before.employee_id;
  const allowed = await canEditEmployeeAttendance(admin, authResult.appUser as AppUser, targetEmployeeId);
  if (!allowed) {
    return NextResponse.json({ error: 'You can only edit attendance records for employees in your team.' }, { status: 403 });
  }

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

  await tryCreateRoleNotification(admin, ['admin'], {
    category: 'admin',
    title: 'Attendance entry edited',
    message: `An attendance record was manually corrected by ${authResult.appUser.full_name}.`,
    link: '/admin/attendance',
    sourceKey: `attendance-edit:${id}:${new Date().toISOString()}`,
  });

  return NextResponse.json({ data });
}
