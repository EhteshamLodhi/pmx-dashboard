import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUserRole } from '@/server/auth';

async function ensureDepartment(admin: ReturnType<typeof createAdminClient>, name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data: existing, error: existingError } = await admin
    .from('departments')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin
    .from('departments')
    .insert({ name: trimmed })
    .select('id')
    .single();

  if (createError) throw createError;
  return created.id;
}

async function ensureProject(
  admin: ReturnType<typeof createAdminClient>,
  name?: string | null,
  departmentId?: string | null,
) {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data: existing, error: existingError } = await admin
    .from('projects')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin
    .from('projects')
    .insert({
      name: trimmed,
      department_id: departmentId ?? null,
    })
    .select('id')
    .single();

  if (createError) throw createError;
  return created.id;
}

export async function GET() {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const { data, error } = await authResult.admin
    .from('users')
    .select('*, department:department_id(name), project:project_id(name)')
    .order('full_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const body = await request.json();
  const admin = authResult.admin;
  const departmentId = await ensureDepartment(admin, body.department);
  const projectId = await ensureProject(admin, body.project, departmentId);

  const { data: authUsers, error: authUsersError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authUsersError) {
    return NextResponse.json({ error: authUsersError.message }, { status: 400 });
  }

  const matchingAuthUser = authUsers.users.find(
    (user) => user.email?.toLowerCase() === String(body.email ?? '').trim().toLowerCase(),
  );

  if (!matchingAuthUser) {
    return NextResponse.json(
      { error: 'This employee must sign in with Microsoft once before you can finish configuring their account.' },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from('users')
    .upsert({
      id: matchingAuthUser.id,
      full_name: String(body.name ?? '').trim() || matchingAuthUser.email,
      email: String(body.email ?? '').trim().toLowerCase(),
      role: body.role,
      department_id: departmentId,
      project_id: projectId,
      reporting_time: body.reportingTime || '09:00',
      check_in_grace_minutes: Number(body.checkInGraceMinutes ?? 15),
      check_out_reminder_time: body.checkOutReminderTime || '19:00',
      sick_leave_days: Number(body.sickLeaveDays ?? 10),
      casual_leave_days: Number(body.casualLeaveDays ?? 10),
      annual_leave_days: Number(body.annualLeaveDays ?? 14),
      line_manager_id: body.lineManagerId || null,
      project_manager_id: body.projectManagerId || null,
      director_id: body.directorId || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const admin = authResult.admin;
  const body = await request.json();
  const { id, department, project, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'User id is required.' }, { status: 400 });
  }

  const departmentId = department !== undefined ? await ensureDepartment(admin, department) : undefined;
  const projectId = project !== undefined ? await ensureProject(admin, project, departmentId ?? null) : undefined;

  const payload: Record<string, unknown> = {
    full_name: updates.name,
    email: typeof updates.email === 'string' ? updates.email.trim().toLowerCase() : updates.email,
    role: updates.role,
    reporting_time: updates.reportingTime,
    check_in_grace_minutes: updates.checkInGraceMinutes,
    check_out_reminder_time: updates.checkOutReminderTime,
    sick_leave_days: updates.sickLeaveDays,
    casual_leave_days: updates.casualLeaveDays,
    annual_leave_days: updates.annualLeaveDays,
    line_manager_id: updates.lineManagerId || null,
    project_manager_id: updates.projectManagerId || null,
    director_id: updates.directorId || null,
    phone: updates.phone,
    is_active: updates.isActive,
  };

  if (department !== undefined) payload.department_id = departmentId;
  if (project !== undefined) payload.project_id = projectId;

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  const { data, error } = await admin
    .from('users')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
