import { NextResponse } from 'next/server';
import { requireUserRole } from '@/server/auth';

export async function POST(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const body = await request.json();
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });

  const { data, error } = await authResult.admin
    .from('reimbursement_categories')
    .insert({ name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserRole(['admin']);
  if (authResult.response || !authResult.admin) return authResult.response;

  const body = await request.json();
  const id = String(body.id ?? '');
  const name = String(body.name ?? '').trim();
  if (!id) return NextResponse.json({ error: 'Category id is required.' }, { status: 400 });

  const payload: { name?: string; is_active?: boolean } = {};
  if (name) payload.name = name;
  if (typeof body.isActive === 'boolean') payload.is_active = body.isActive;

  const { data, error } = await authResult.admin
    .from('reimbursement_categories')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
