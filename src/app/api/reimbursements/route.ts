import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser } from '@/server/auth';
import { tryCreateNotification, tryCreateNotifications, tryCreateRoleNotification } from '@/server/notifications';

const allowedFileTypes = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const bucketName = 'reimbursement-receipts';
const highValueThreshold = Number(process.env.REIMBURSEMENT_HIGH_VALUE_THRESHOLD ?? '10000');

function money(amount: number, currency = 'PKR') {
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function selectQuery() {
  return `
    *,
    employee:employee_id(full_name, project:project_id(name)),
    category:category_id(name),
    reimbursement_attachments(*),
    reimbursement_approvals(
      approval_level,
      approver_id,
      approver_role,
      status,
      comment,
      acted_at,
      approver:approver_id(full_name)
    ),
    reimbursement_payments(
      payment_date,
      payment_method,
      payment_reference,
      remarks,
      processed_at,
      processor:processed_by(full_name)
    )
  `;
}

async function getActor(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from('users')
    .select('id, full_name, role, line_manager_id, project_manager_id, director_id, project:project_id(name)')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as any;
}

async function getVisibleUserIdsForActor(admin: ReturnType<typeof createAdminClient>, actor: any) {
  if (actor.role === 'admin' || actor.role === 'director') return null;
  if (actor.role === 'employee') return [actor.id];

  const { data, error } = await admin
    .from('users')
    .select('id, line_manager_id, project_manager_id')
    .eq('is_active', true);

  if (error) throw error;

  const users = data ?? [];
  const visible = new Set<string>([actor.id]);
  users
    .filter((user) => user.line_manager_id === actor.id)
    .forEach((user) => visible.add(user.id));
  const projectVisible = new Set<string>();
  users
    .filter((user) => user.project_manager_id === actor.id)
    .forEach((user) => projectVisible.add(user.id));

  let changed = true;
  while (changed) {
    changed = false;
    users.forEach((user) => {
      if (!projectVisible.has(user.id) && user.line_manager_id && projectVisible.has(user.line_manager_id)) {
        projectVisible.add(user.id);
        changed = true;
      }
    });
  }
  projectVisible.forEach((id) => visible.add(id));

  return Array.from(visible);
}

async function fetchRequest(admin: ReturnType<typeof createAdminClient>, reimbursementId: string) {
  const { data, error } = await admin
    .from('reimbursement_requests')
    .select(selectQuery())
    .eq('id', reimbursementId)
    .maybeSingle();

  if (error) throw error;
  return data as any;
}

async function ensureReceiptBucket(admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: Array.from(allowedFileTypes),
  });

  if (error && !error.message.toLowerCase().includes('already exists')) {
    console.warn('Unable to create reimbursement receipt bucket', error.message);
  }
}

async function signedReceiptUrl(admin: ReturnType<typeof createAdminClient>, path: string) {
  const { data } = await admin.storage.from(bucketName).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function GET() {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const admin = createAdminClient();
  const actor = await getActor(admin, authResult.user.id);
  if (!actor) return NextResponse.json({ error: 'User profile is not configured.' }, { status: 400 });

  let query = admin
    .from('reimbursement_requests')
    .select(selectQuery())
    .order('created_at', { ascending: false });

  const visibleUserIds = await getVisibleUserIdsForActor(admin, actor);
  if (visibleUserIds) {
    query = query.in('employee_id', visibleUserIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withSignedAttachments = await Promise.all(
    ((data ?? []) as any[]).map(async (request) => ({
      ...request,
      reimbursement_attachments: await Promise.all(
        (request.reimbursement_attachments ?? []).map(async (attachment: { file_path: string }) => ({
          ...attachment,
          public_url: await signedReceiptUrl(admin, attachment.file_path),
        })),
      ),
    })),
  );

  const { data: categories, error: categoryError } = await admin
    .from('reimbursement_categories')
    .select('*')
    .order('name');

  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 });
  return NextResponse.json({ data: withSignedAttachments, categories });
}

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const admin = createAdminClient();
  const actor = await getActor(admin, authResult.user.id);
  if (!actor) return NextResponse.json({ error: 'User profile is not configured.' }, { status: 400 });
  if (!actor.line_manager_id) {
    return NextResponse.json(
      { error: 'Your reporting hierarchy is incomplete. Ask an admin to assign a line manager.' },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const categoryId = String(formData.get('categoryId') ?? '');
  const expenseDate = String(formData.get('expenseDate') ?? '').slice(0, 10);
  const amount = Number(formData.get('amount') ?? 0);
  const currency = String(formData.get('currency') ?? 'PKR').trim().toUpperCase() || 'PKR';
  const project = String(formData.get('project') ?? '').trim();
  const vendorName = String(formData.get('vendorName') ?? '').trim();
  const receiptNumber = String(formData.get('receiptNumber') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const files = formData.getAll('attachments').filter((value): value is File => value instanceof File && value.size > 0);

  if (!categoryId || !expenseDate || !amount || amount <= 0 || !description) {
    return NextResponse.json({ error: 'Category, expense date, amount, and description are required.' }, { status: 400 });
  }

  if (files.some((file) => !allowedFileTypes.has(file.type))) {
    return NextResponse.json({ error: 'Receipts must be PDF, JPG, JPEG, or PNG files.' }, { status: 400 });
  }

  const { data: created, error } = await admin
    .from('reimbursement_requests')
    .insert({
      employee_id: actor.id,
      category_id: categoryId,
      expense_date: expenseDate,
      amount,
      currency,
      project: project || actor.project?.name || null,
      vendor_name: vendorName || null,
      receipt_number: receiptNumber || null,
      description,
      status: 'pending_manager',
      submitted_at: new Date().toISOString(),
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('id, request_number')
    .single();

  if (error || !created) return NextResponse.json({ error: error?.message ?? 'Unable to create reimbursement.' }, { status: 400 });

  const workflowRows = [
    {
      reimbursement_id: created.id,
      approval_level: 1,
      approver_id: actor.line_manager_id,
      approver_role: 'Line Manager',
      status: 'pending',
    },
  ];

  const { error: workflowError } = await admin.from('reimbursement_approvals').insert(workflowRows);
  if (workflowError) {
    await admin.from('reimbursement_requests').delete().eq('id', created.id);
    return NextResponse.json({ error: workflowError.message }, { status: 400 });
  }

  await ensureReceiptBucket(admin);
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `${actor.id}/${created.id}/${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(bucketName).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      console.error('Reimbursement receipt upload failed', uploadError);
      continue;
    }

    await admin.from('reimbursement_attachments').insert({
      reimbursement_id: created.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      file_path: path,
      uploaded_by: actor.id,
    });
  }

  await tryCreateNotifications(admin, [
    {
      userId: actor.id,
      category: 'reimbursement',
      title: 'Reimbursement submitted',
      message: `Your reimbursement request ${created.request_number} was submitted for approval.`,
      link: '/reimbursements',
      sourceKey: `reimbursement-submitted:${created.id}:employee`,
    },
    {
      userId: actor.line_manager_id,
      category: 'approval',
      title: 'Reimbursement approval pending',
      message: `New reimbursement request submitted by ${actor.full_name} for ${money(amount, currency)}.`,
      link: '/reimbursements',
      sourceKey: `reimbursement-submitted:${created.id}:manager`,
    },
  ]);

  if (amount >= highValueThreshold) {
    await tryCreateNotification(admin, {
      userId: actor.director_id,
      category: 'reimbursement',
      title: 'High-value reimbursement alert',
      message: `High-value reimbursement request submitted by ${actor.full_name} for ${money(amount, currency)}.`,
      link: '/reimbursements',
      sourceKey: `reimbursement-high-value:${created.id}:director`,
    });
  }

  const data = await fetchRequest(admin, created.id);
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const admin = createAdminClient();
  const actor = await getActor(admin, authResult.user.id);
  if (!actor) return NextResponse.json({ error: 'User profile is not configured.' }, { status: 400 });

  const body = await request.json();
  const action = String(body.action ?? '');
  const reimbursementId = String(body.reimbursementId ?? body.id ?? '');
  if (!reimbursementId) return NextResponse.json({ error: 'Reimbursement request id is required.' }, { status: 400 });

  if (action === 'update') {
    const { data: reimbursement, error } = await admin
      .from('reimbursement_requests')
      .select('employee_id, status')
      .eq('id', reimbursementId)
      .maybeSingle();

    if (error || !reimbursement) return NextResponse.json({ error: 'Reimbursement request was not found.' }, { status: 404 });
    if (reimbursement.employee_id !== actor.id && actor.role !== 'admin') {
      return NextResponse.json({ error: 'You can only edit your own reimbursement requests.' }, { status: 403 });
    }
    if (!['draft', 'submitted', 'pending_manager'].includes(reimbursement.status)) {
      return NextResponse.json({ error: 'Approved, rejected, paid, or processed reimbursements cannot be edited.' }, { status: 400 });
    }

    const amount = Number(body.amount ?? 0);
    const expenseDate = String(body.expenseDate ?? '').slice(0, 10);
    const description = String(body.description ?? '').trim();
    const categoryId = String(body.categoryId ?? '');
    if (!categoryId || !expenseDate || !amount || amount <= 0 || !description) {
      return NextResponse.json({ error: 'Category, expense date, amount, and description are required.' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('reimbursement_requests')
      .update({
        category_id: categoryId,
        expense_date: expenseDate,
        amount,
        currency: String(body.currency ?? 'PKR').trim().toUpperCase() || 'PKR',
        project: String(body.project ?? '').trim() || null,
        vendor_name: String(body.vendorName ?? '').trim() || null,
        receipt_number: String(body.receiptNumber ?? '').trim() || null,
        description,
        updated_by: actor.id,
      })
      .eq('id', reimbursementId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ data: await fetchRequest(admin, reimbursementId) });
  }

  if (action === 'payment') {
    if (actor.role !== 'admin') return NextResponse.json({ error: 'Only admins can mark reimbursements as paid.' }, { status: 403 });
    const paymentDate = String(body.paymentDate ?? '').slice(0, 10);
    const paymentMethod = String(body.paymentMethod ?? '');
    if (!paymentDate || !['bank_transfer', 'cash', 'cheque', 'other'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Payment date and method are required.' }, { status: 400 });
    }

    const { data: reimbursement } = await admin
      .from('reimbursement_requests')
      .select('employee_id, amount, currency, request_number')
      .eq('id', reimbursementId)
      .maybeSingle();

    const { error: paymentError } = await admin.from('reimbursement_payments').upsert({
      reimbursement_id: reimbursementId,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      payment_reference: String(body.referenceNumber ?? '').trim() || null,
      remarks: String(body.remarks ?? '').trim() || null,
      processed_by: actor.id,
      processed_at: new Date().toISOString(),
    }, { onConflict: 'reimbursement_id' });

    if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 400 });

    await admin.from('reimbursement_requests').update({ status: 'paid', updated_by: actor.id }).eq('id', reimbursementId);
    await admin
      .from('reimbursement_approvals')
      .upsert({
        reimbursement_id: reimbursementId,
        approval_level: 2,
        approver_id: actor.id,
        approver_role: 'Finance/Admin',
        status: 'approved',
        comment: String(body.remarks ?? '').trim() || 'Payment processed',
        acted_at: new Date().toISOString(),
      }, { onConflict: 'reimbursement_id,approval_level' });

    if (reimbursement) {
      await tryCreateNotification(admin, {
        userId: reimbursement.employee_id,
        category: 'reimbursement',
        title: 'Reimbursement paid',
        message: `Your reimbursement ${reimbursement.request_number} for ${money(Number(reimbursement.amount), reimbursement.currency)} has been marked as paid.`,
        link: '/reimbursements',
        sourceKey: `reimbursement-paid:${reimbursementId}:employee`,
      });
    }

    return NextResponse.json({ data: await fetchRequest(admin, reimbursementId) });
  }

  if (action === 'remaining') {
    if (actor.role !== 'admin') return NextResponse.json({ error: 'Only admins can mark reimbursements as remaining.' }, { status: 403 });

    const { data: reimbursement } = await admin
      .from('reimbursement_requests')
      .select('employee_id, request_number')
      .eq('id', reimbursementId)
      .maybeSingle();

    await admin.from('reimbursement_payments').delete().eq('reimbursement_id', reimbursementId);
    const { error: updateError } = await admin
      .from('reimbursement_requests')
      .update({ status: 'approved', updated_by: actor.id })
      .eq('id', reimbursementId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    await admin
      .from('reimbursement_approvals')
      .upsert({
        reimbursement_id: reimbursementId,
        approval_level: 2,
        approver_id: actor.id,
        approver_role: 'Finance/Admin',
        status: 'pending',
        comment: 'Marked as remaining / pending payment',
        acted_at: null,
      }, { onConflict: 'reimbursement_id,approval_level' });

    if (reimbursement) {
      await tryCreateNotification(admin, {
        userId: reimbursement.employee_id,
        category: 'reimbursement',
        title: 'Reimbursement pending payment',
        message: `Your reimbursement ${reimbursement.request_number} is marked as remaining / pending payment.`,
        link: '/reimbursements',
        sourceKey: `reimbursement-remaining:${reimbursementId}:employee`,
      });
    }

    return NextResponse.json({ data: await fetchRequest(admin, reimbursementId) });
  }

  if (action === 'approval') {
    const level = Number(body.level) as 1;
    const decision = String(body.decision ?? '');
    const comment = String(body.comment ?? '').trim();
    if (level !== 1 || !['approved', 'rejected', 'more_info'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid reimbursement approval payload.' }, { status: 400 });
    }
    if (actor.role !== 'manager') {
      return NextResponse.json({ error: 'Only the assigned manager can approve or reject reimbursements.' }, { status: 403 });
    }
    if ((decision === 'rejected' || decision === 'more_info') && !comment) {
      return NextResponse.json({ error: 'Comments are required for rejection or more information requests.' }, { status: 400 });
    }

    const { data: steps, error: stepsError } = await admin
      .from('reimbursement_approvals')
      .select('id, approval_level, approver_id, status')
      .eq('reimbursement_id', reimbursementId)
      .order('approval_level');

    if (stepsError || !steps?.length) return NextResponse.json({ error: 'Approval workflow was not found.' }, { status: 404 });

    const currentStep = steps.find((step) => step.approval_level === level);
    if (!currentStep) return NextResponse.json({ error: 'Approval step was not found.' }, { status: 404 });
    if (actor.role !== 'admin' && currentStep.approver_id !== actor.id) {
      return NextResponse.json({ error: 'You are not assigned to this approval step.' }, { status: 403 });
    }
    if (currentStep.status !== 'pending') {
      return NextResponse.json({ error: 'This approval step has already been completed.' }, { status: 400 });
    }
    if (steps.some((step) => step.approval_level < level && step.status !== 'approved')) {
      return NextResponse.json({ error: 'Previous approval steps must be completed first.' }, { status: 400 });
    }

    const nextStatus =
      decision === 'approved'
        ? 'approved'
        : decision === 'rejected'
          ? 'rejected'
          : 'more_info';

    const { data: reimbursementData } = await admin
      .from('reimbursement_requests')
      .select('employee_id, amount, currency, request_number, employee:employee_id(full_name, director_id)')
      .eq('id', reimbursementId)
      .maybeSingle();
    const reimbursement = reimbursementData as any;

    const actedAt = new Date().toISOString();
    const { error: approvalError } = await admin
      .from('reimbursement_approvals')
      .update({
        status: decision,
        comment: comment || null,
        acted_at: actedAt,
      })
      .eq('id', currentStep.id);

    if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 400 });

    await admin
      .from('reimbursement_requests')
      .update({ status: nextStatus, decided_at: ['approved', 'rejected'].includes(nextStatus) ? actedAt : null, updated_by: actor.id })
      .eq('id', reimbursementId);

    if (decision === 'approved') {
      await admin
        .from('reimbursement_approvals')
        .delete()
        .eq('reimbursement_id', reimbursementId)
        .gt('approval_level', 1);
    }

    if (reimbursement && decision === 'approved') {
      await tryCreateRoleNotification(admin, ['admin'], {
        category: 'reimbursement',
        title: 'Reimbursement awaiting payment',
        message: `Approved reimbursement ${reimbursement.request_number} for ${money(Number(reimbursement.amount), reimbursement.currency)} is ready for payment.`,
        link: '/reimbursements',
        sourceKey: `reimbursement-approved:${reimbursementId}:admin`,
      });
    }

    if (reimbursement) {
      await tryCreateNotification(admin, {
        userId: reimbursement.employee_id,
        category: 'reimbursement',
        title:
          decision === 'rejected'
            ? 'Reimbursement rejected'
            : decision === 'more_info'
              ? 'Reimbursement needs more information'
              : 'Reimbursement approved',
        message:
          decision === 'rejected'
            ? `Your reimbursement ${reimbursement.request_number} was rejected.`
            : decision === 'more_info'
              ? `More information is required for reimbursement ${reimbursement.request_number}.`
              : `Your reimbursement ${reimbursement.request_number} was approved and is awaiting payment.`,
        link: '/reimbursements',
        sourceKey: `reimbursement-decision:${reimbursementId}:${decision}:employee`,
      });
    }

    return NextResponse.json({ data: await fetchRequest(admin, reimbursementId) });
  }

  return NextResponse.json({ error: 'Unsupported reimbursement action.' }, { status: 400 });
}

export async function DELETE(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  const url = new URL(request.url);
  const reimbursementId = url.searchParams.get('id') ?? '';
  if (!reimbursementId) return NextResponse.json({ error: 'Reimbursement request id is required.' }, { status: 400 });

  const admin = createAdminClient();
  const actor = await getActor(admin, authResult.user.id);
  if (!actor) return NextResponse.json({ error: 'User profile is not configured.' }, { status: 400 });

  const { data: reimbursement, error } = await admin
    .from('reimbursement_requests')
    .select('id, employee_id, status')
    .eq('id', reimbursementId)
    .maybeSingle();

  if (error || !reimbursement) return NextResponse.json({ error: 'Reimbursement request was not found.' }, { status: 404 });
  if (reimbursement.employee_id !== actor.id && actor.role !== 'admin') {
    return NextResponse.json({ error: 'You can only delete your own reimbursement requests.' }, { status: 403 });
  }
  if (!['draft', 'submitted', 'pending_manager'].includes(reimbursement.status)) {
    return NextResponse.json({ error: 'Only draft or unapproved submitted reimbursements can be deleted.' }, { status: 400 });
  }

  await admin.from('notifications').delete().ilike('source_key', `%${reimbursementId}%`);
  const { error: deleteError } = await admin.from('reimbursement_requests').delete().eq('id', reimbursementId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
