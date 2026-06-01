'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  Loader2,
  PlusCircle,
  ReceiptText,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ReimbursementCategory, ReimbursementRequest } from '../types';
import { mapReimbursementCategory, mapReimbursementRequest } from '@/lib/supabase/mappers';
import { useActionRunner } from '@/app/hooks/useActionRunner';

const TODAY = new Date().toISOString().split('T')[0];

type FormState = {
  categoryId: string;
  expenseDate: string;
  amount: string;
  currency: string;
  project: string;
  vendorName: string;
  receiptNumber: string;
  description: string;
  attachments: File[];
};

const emptyForm: FormState = {
  categoryId: '',
  expenseDate: TODAY,
  amount: '',
  currency: 'PKR',
  project: '',
  vendorName: '',
  receiptNumber: '',
  description: '',
  attachments: [],
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function statusBadge(status: ReimbursementRequest['status']) {
  switch (status) {
    case 'paid':
      return { label: 'Paid', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 };
    case 'approved':
      return { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 };
    case 'rejected':
      return { label: 'Rejected', cls: 'bg-red-100 text-red-700', icon: XCircle };
    case 'pending_manager':
      return { label: 'Pending Manager', cls: 'bg-yellow-100 text-yellow-700', icon: Clock };
    case 'pending_director':
      return { label: 'Pending Director', cls: 'bg-orange-100 text-orange-700', icon: Clock };
    case 'more_info':
      return { label: 'More Info', cls: 'bg-blue-100 text-blue-700', icon: FileText };
    case 'cancelled':
      return { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500', icon: XCircle };
    case 'draft':
      return { label: 'Draft', cls: 'bg-gray-100 text-gray-600', icon: FileText };
    default:
      return { label: 'Submitted', cls: 'bg-blue-100 text-blue-700', icon: Clock };
  }
}

function pendingApproval(request: ReimbursementRequest) {
  return request.approvals.find((approval) => approval.status === 'pending');
}

function canEditOrDelete(request: ReimbursementRequest, userId?: string, isAdmin = false) {
  return (request.userId === userId || isAdmin) && ['draft', 'submitted', 'pending_manager'].includes(request.status);
}

function ApprovalTimeline({ request }: { request: ReimbursementRequest }) {
  const steps = [
    {
      label: 'Submitted',
      sublabel: request.userName,
      status: 'approved',
      comment: undefined,
    },
    ...request.approvals.map((approval) => ({
      label: approval.role,
      sublabel: approval.approverName,
      status: approval.status,
      comment: approval.comment,
    })),
    {
      label: 'Paid',
      sublabel: request.payment?.processedBy ?? 'Finance/Admin',
      status: request.status === 'paid' ? 'approved' : 'pending',
      comment: request.payment?.remarks,
    },
  ];

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const done = step.status === 'approved';
        const rejected = step.status === 'rejected';
        return (
          <div key={`${step.label}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                done ? 'bg-green-600 border-green-600' : rejected ? 'bg-red-500 border-red-500' : 'bg-white border-gray-200'
              }`}>
                {done ? <CheckCircle2 className="w-4 h-4 text-white" /> : rejected ? <XCircle className="w-4 h-4 text-white" /> : <Clock className="w-4 h-4 text-gray-300" />}
              </div>
              {index < steps.length - 1 && <div className={`w-0.5 min-h-8 flex-1 ${done ? 'bg-green-200' : 'bg-gray-200'}`} />}
            </div>
            <div className="flex-1 pb-4">
              <p className={`${done ? 'text-green-700' : rejected ? 'text-red-600' : 'text-gray-500'} font-semibold text-sm`}>
                {step.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{step.sublabel}</p>
              {step.comment && (
                <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  {step.comment}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Reimbursements() {
  const { currentUser } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [requests, setRequests] = useState<ReimbursementRequest[]>([]);
  const [categories, setCategories] = useState<ReimbursementCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReimbursementRequest | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReimbursementRequest | null>(null);
  const [actionTarget, setActionTarget] = useState<{ request: ReimbursementRequest; decision: 'approved' | 'rejected' | 'more_info' } | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<ReimbursementRequest | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [payment, setPayment] = useState({
    paymentDate: TODAY,
    paymentMethod: 'bank_transfer',
    referenceNumber: '',
    remarks: '',
  });

  const isAdmin = currentUser?.role === 'admin';
  const isApprover = ['manager', 'director', 'admin'].includes(currentUser?.role ?? '');

  const load = async () => {
    const response = await fetch('/api/reimbursements', { credentials: 'include' });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to load reimbursements.');
    const body = await response.json();
    setRequests((body.data ?? []).map(mapReimbursementRequest));
    setCategories((body.categories ?? []).map(mapReimbursementCategory));
  };

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load reimbursements.'));
  }, []);

  const myRequests = useMemo(
    () => requests.filter((request) => request.userId === currentUser?.id),
    [currentUser?.id, requests],
  );

  const pendingForMe = useMemo(
    () =>
      requests.filter((request) => {
        const pending = pendingApproval(request);
        if (!pending || !currentUser) return false;
        return currentUser.role === 'admin' || pending.approverId === currentUser.id;
      }),
    [currentUser, requests],
  );

  const paymentQueue = requests.filter((request) => request.status === 'approved');
  const totalPaid = requests.filter((request) => request.status === 'paid').reduce((sum, request) => sum + request.amount, 0);
  const monthlyPaid = requests
    .filter((request) => request.status === 'paid' && request.payment?.paymentDate?.slice(0, 7) === TODAY.slice(0, 7))
    .reduce((sum, request) => sum + request.amount, 0);

  const displayRequests = isApprover ? requests : myRequests;

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  };

  const beginEdit = (request: ReimbursementRequest) => {
    setEditing(request);
    setShowForm(true);
    setForm({
      categoryId: request.categoryId ?? '',
      expenseDate: request.expenseDate,
      amount: String(request.amount),
      currency: request.currency,
      project: request.project ?? '',
      vendorName: request.vendorName ?? '',
      receiptNumber: request.receiptNumber ?? '',
      description: request.description,
      attachments: [],
    });
  };

  const submit = async () => {
    await runAction(editing ? `reimbursement-edit:${editing.id}` : 'reimbursement-submit', async () => {
      setError(null);
      if (editing) {
        const response = await fetch('/api/reimbursements', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update', reimbursementId: editing.id, ...form, amount: Number(form.amount) }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to update reimbursement.');
        const body = await response.json();
        setRequests((items) => items.map((item) => (item.id === editing.id ? mapReimbursementRequest(body.data) : item)));
      } else {
        const payload = new FormData();
        Object.entries(form).forEach(([key, value]) => {
          if (key === 'attachments') return;
          payload.append(key, String(value));
        });
        form.attachments.forEach((file) => payload.append('attachments', file));
        const response = await fetch('/api/reimbursements', { method: 'POST', credentials: 'include', body: payload });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to submit reimbursement.');
        const body = await response.json();
        setRequests((items) => [mapReimbursementRequest(body.data), ...items]);
      }
      resetForm();
    }, {
      loading: editing ? 'Updating reimbursement...' : 'Submitting reimbursement...',
      success: editing ? 'Reimbursement updated.' : 'Reimbursement submitted.',
      error: editing ? 'Unable to update reimbursement.' : 'Unable to submit reimbursement.',
    }).catch((submitError) => setError(submitError instanceof Error ? submitError.message : 'Request failed.'));
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const previous = requests;
    await runAction(`reimbursement-delete:${deleteTarget.id}`, async () => {
      setRequests((items) => items.filter((item) => item.id !== deleteTarget.id));
      const response = await fetch(`/api/reimbursements?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to delete reimbursement.');
      setDeleteTarget(null);
    }, {
      loading: 'Deleting reimbursement...',
      success: 'Reimbursement deleted.',
      error: 'Unable to delete reimbursement.',
    }).catch((deleteError) => {
      setRequests(previous);
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete reimbursement.');
    });
  };

  const approve = async () => {
    if (!actionTarget) return;
    const pending = pendingApproval(actionTarget.request);
    if (!pending) return;
    await runAction(`reimbursement-approval:${actionTarget.request.id}`, async () => {
      const response = await fetch('/api/reimbursements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'approval',
          reimbursementId: actionTarget.request.id,
          level: pending.level,
          decision: actionTarget.decision,
          comment,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to update approval.');
      const body = await response.json();
      setRequests((items) => items.map((item) => (item.id === actionTarget.request.id ? mapReimbursementRequest(body.data) : item)));
      setActionTarget(null);
      setComment('');
    }, {
      loading: 'Updating reimbursement approval...',
      success: 'Reimbursement approval updated.',
      error: 'Unable to update reimbursement approval.',
    }).catch((approvalError) => setError(approvalError instanceof Error ? approvalError.message : 'Unable to update approval.'));
  };

  const markPaid = async () => {
    if (!paymentTarget) return;
    await runAction(`reimbursement-payment:${paymentTarget.id}`, async () => {
      const response = await fetch('/api/reimbursements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'payment', reimbursementId: paymentTarget.id, ...payment }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to mark reimbursement as paid.');
      const body = await response.json();
      setRequests((items) => items.map((item) => (item.id === paymentTarget.id ? mapReimbursementRequest(body.data) : item)));
      setPaymentTarget(null);
      setPayment({ paymentDate: TODAY, paymentMethod: 'bank_transfer', referenceNumber: '', remarks: '' });
    }, {
      loading: 'Marking reimbursement as paid...',
      success: 'Reimbursement marked as paid.',
      error: 'Unable to mark reimbursement as paid.',
    }).catch((paymentError) => setError(paymentError instanceof Error ? paymentError.message : 'Unable to mark reimbursement as paid.'));
  };

  const exportCsv = () => {
    const rows = [
      ['Request ID', 'Employee', 'Category', 'Expense Date', 'Amount', 'Currency', 'Project', 'Status', 'Submitted At'],
      ...displayRequests.map((request) => [
        request.requestNumber,
        request.userName,
        request.categoryName,
        request.expenseDate,
        String(request.amount),
        request.currency,
        request.project ?? request.userProject,
        request.status,
        request.submittedAt ?? request.createdAt,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reimbursements-${TODAY}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveCategory = async () => {
    if (!categoryDraft.trim()) return;
    await runAction('reimbursement-category-add', async () => {
      const response = await fetch('/api/admin/reimbursement-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: categoryDraft }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to save category.');
      const body = await response.json();
      setCategories((items) => [...items, mapReimbursementCategory(body.data)].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryDraft('');
    }, {
      loading: 'Saving category...',
      success: 'Category saved.',
      error: 'Unable to save category.',
    }).catch((categoryError) => setError(categoryError instanceof Error ? categoryError.message : 'Unable to save category.'));
  };

  const toggleCategory = async (category: ReimbursementCategory) => {
    await runAction(`reimbursement-category-toggle:${category.id}`, async () => {
      const response = await fetch('/api/admin/reimbursement-categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: category.id, isActive: !category.isActive }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to update category.');
      const body = await response.json();
      const updated = mapReimbursementCategory(body.data);
      setCategories((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    }, {
      loading: 'Updating category...',
      success: category.isActive ? 'Category disabled.' : 'Category enabled.',
      error: 'Unable to update category.',
    }).catch((categoryError) => setError(categoryError instanceof Error ? categoryError.message : 'Unable to update category.'));
  };

  const summary = [
    { label: 'Total Submitted', value: myRequests.length, cls: 'text-gray-900 bg-gray-50' },
    { label: 'Pending', value: myRequests.filter((request) => request.status.startsWith('pending')).length, cls: 'text-orange-700 bg-orange-50' },
    { label: 'Approved', value: myRequests.filter((request) => request.status === 'approved').length, cls: 'text-emerald-700 bg-emerald-50' },
    { label: 'Rejected', value: myRequests.filter((request) => request.status === 'rejected').length, cls: 'text-red-700 bg-red-50' },
    { label: 'Paid', value: myRequests.filter((request) => request.status === 'paid').length, cls: 'text-green-700 bg-green-50' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>Reimbursements</h1>
          <p className="text-gray-500 mt-1 text-sm">Submit expenses, review approvals, and track payments</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl hover:bg-green-700 shadow-sm text-sm font-semibold"
        >
          <PlusCircle className="w-4 h-4" />
          New Claim
        </button>
      </div>
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summary.map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${item.cls}`}>
              <ReceiptText className="w-4 h-4" />
            </div>
            <p className="text-gray-900 text-xl font-bold">{item.value}</p>
            <p className="text-gray-400 text-xs">{item.label}</p>
          </div>
        ))}
      </div>

      {isApprover && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-4">
            <p className="text-orange-700 text-sm font-semibold">Needs My Approval</p>
            <p className="text-gray-900 text-2xl font-bold mt-2">{pendingForMe.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
            <p className="text-green-700 text-sm font-semibold">Pending Payment</p>
            <p className="text-gray-900 text-2xl font-bold mt-2">{paymentQueue.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
            <p className="text-blue-700 text-sm font-semibold">Monthly Reimbursement Cost</p>
            <p className="text-gray-900 text-2xl font-bold mt-2">{formatMoney(monthlyPaid, 'PKR')}</p>
            <p className="text-xs text-gray-400 mt-1">All-time paid: {formatMoney(totalPaid, 'PKR')}</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-green-500 px-5 py-4">
            <h2 className="text-white font-semibold">{editing ? 'Edit Reimbursement' : 'New Reimbursement Claim'}</h2>
            <p className="text-green-100 text-sm mt-0.5">Upload receipts and submit your company expense</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm text-gray-600">
                Expense Category
                <select value={form.categoryId} onChange={(event) => setForm((value) => ({ ...value, categoryId: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">Select category</option>
                  {categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-gray-600">
                Expense Date
                <input type="date" value={form.expenseDate} max={TODAY} onChange={(event) => setForm((value) => ({ ...value, expenseDate: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500" />
              </label>
              <label className="text-sm text-gray-600">
                Amount
                <input type="number" min={1} value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="text-sm text-gray-600">
                Currency
                <input value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value.toUpperCase() }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500" />
              </label>
              <label className="text-sm text-gray-600">
                Project (Optional)
                <input value={form.project} onChange={(event) => setForm((value) => ({ ...value, project: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500" />
              </label>
              <label className="text-sm text-gray-600">
                Vendor (Optional)
                <input value={form.vendorName} onChange={(event) => setForm((value) => ({ ...value, vendorName: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500" />
              </label>
              <label className="text-sm text-gray-600">
                Receipt Number
                <input value={form.receiptNumber} onChange={(event) => setForm((value) => ({ ...value, receiptNumber: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500" />
              </label>
            </div>

            <label className="block text-sm text-gray-600">
              Description / Justification
              <textarea rows={3} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            </label>

            {!editing && (
              <label className="block rounded-2xl border border-dashed border-green-200 bg-green-50/50 p-5 text-center cursor-pointer hover:bg-green-50 transition-colors">
                <UploadCloud className="w-7 h-7 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-green-700">Upload receipts</p>
                <p className="text-xs text-green-600 mt-1">PDF, JPG, JPEG, PNG. Multiple files supported.</p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => setForm((value) => ({ ...value, attachments: Array.from(event.target.files ?? []) }))}
                  className="sr-only"
                />
                {form.attachments.length > 0 && <p className="mt-3 text-xs text-gray-500">{form.attachments.map((file) => file.name).join(', ')}</p>}
              </label>
            )}

            <div className="flex gap-3">
              <button onClick={resetForm} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => void submit()}
                disabled={!form.categoryId || !form.expenseDate || !form.amount || !form.description.trim() || isPending('reimbursement-submit') || Boolean(editing && isPending(`reimbursement-edit:${editing.id}`))}
                className="flex-1 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 font-semibold"
              >
                {isPending('reimbursement-submit') || Boolean(editing && isPending(`reimbursement-edit:${editing.id}`)) ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Saving...</span> : editing ? 'Update Claim' : 'Submit Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-gray-900 font-semibold">Expense Categories</h2>
              <p className="text-gray-500 text-sm">Admin configurable reimbursement categories</p>
            </div>
            <div className="flex gap-2">
              <input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} placeholder="New category" className="px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={() => void saveCategory()} disabled={!categoryDraft.trim() || isPending('reimbursement-category-add')} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-60">
                {isPending('reimbursement-category-add') ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => void toggleCategory(category)}
                disabled={isPending(`reimbursement-category-toggle:${category.id}`)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-60 ${category.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                title={category.isActive ? 'Click to disable' : 'Click to enable'}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-900 font-semibold">{isApprover ? 'Reimbursement Queue' : 'My Reimbursements'}</h2>
          <span className="text-xs text-gray-400">{displayRequests.length} total</span>
        </div>
        {displayRequests.length === 0 ? (
          <div className="p-10 text-center">
            <ReceiptText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No reimbursement requests yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayRequests.map((request) => {
              const badge = statusBadge(request.status);
              const StatusIcon = badge.icon;
              const pending = pendingApproval(request);
              const canApprove = Boolean(pending && currentUser && (currentUser.role === 'admin' || pending.approverId === currentUser.id));
              return (
                <div key={request.id} className="p-5 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-gray-900 font-semibold">{request.requestNumber}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${badge.cls}`}>
                          <StatusIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">{request.categoryName}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {request.userName} - {request.userProject} - {request.expenseDate}
                      </p>
                      <p className="text-sm text-gray-700 mt-2">{request.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-gray-900 font-bold">{formatMoney(request.amount, request.currency)}</p>
                      <p className="text-xs text-gray-400 mt-1">{request.vendorName ?? request.project ?? 'No vendor'}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => setExpandedId(expandedId === request.id ? null : request.id)} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-semibold">
                      {expandedId === request.id ? 'Hide Details' : 'View Details'}
                    </button>
                    {canApprove && (
                      <>
                        <button onClick={() => setActionTarget({ request, decision: 'approved' })} className="px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-semibold">Approve</button>
                        <button onClick={() => setActionTarget({ request, decision: 'rejected' })} className="px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 text-sm font-semibold">Reject</button>
                        <button onClick={() => setActionTarget({ request, decision: 'more_info' })} className="px-3 py-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 text-sm font-semibold">More Info</button>
                      </>
                    )}
                    {isAdmin && request.status === 'approved' && (
                      <button onClick={() => setPaymentTarget(request)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold">Mark Paid</button>
                    )}
                    {canEditOrDelete(request, currentUser?.id, isAdmin) && (
                      <>
                        <button onClick={() => beginEdit(request)} className="p-2 rounded-xl text-green-600 hover:bg-green-50"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteTarget(request)} className="p-2 rounded-xl text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>

                  {expandedId === request.id && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Receipts</p>
                        {request.attachments.length === 0 ? (
                          <p className="text-sm text-gray-400">No attachments uploaded.</p>
                        ) : (
                          <div className="space-y-2">
                            {request.attachments.map((attachment) => (
                              <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-white border border-gray-100 px-3 py-2 text-sm text-gray-600 hover:text-green-700">
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <FileText className="w-4 h-4 flex-shrink-0" />
                                  <span className="truncate">{attachment.fileName}</span>
                                </span>
                                <Download className="w-4 h-4 flex-shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white p-4">
                        <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Approval Timeline</p>
                        <ApprovalTimeline request={request} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {actionTarget && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-5">
            <h3 className="text-gray-900 font-semibold">Update reimbursement approval</h3>
            <p className="text-sm text-gray-500 mt-1">{actionTarget.request.requestNumber} - {formatMoney(actionTarget.request.amount, actionTarget.request.currency)}</p>
            <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={actionTarget.decision === 'approved' ? 'Comment (optional)' : 'Comment required'} className="mt-4 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setActionTarget(null); setComment(''); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600">Cancel</button>
              <button onClick={() => void approve()} disabled={isPending(`reimbursement-approval:${actionTarget.request.id}`)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-60">
                {isPending(`reimbursement-approval:${actionTarget.request.id}`) ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentTarget && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-5">
            <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center mb-4">
              <Banknote className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-gray-900 font-semibold">Mark reimbursement as paid</h3>
            <p className="text-sm text-gray-500 mt-1">{paymentTarget.requestNumber} - {formatMoney(paymentTarget.amount, paymentTarget.currency)}</p>
            <div className="mt-4 space-y-3">
              <input type="date" value={payment.paymentDate} onChange={(event) => setPayment((value) => ({ ...value, paymentDate: event.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500" />
              <select value={payment.paymentMethod} onChange={(event) => setPayment((value) => ({ ...value, paymentMethod: event.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
              <input value={payment.referenceNumber} onChange={(event) => setPayment((value) => ({ ...value, referenceNumber: event.target.value }))} placeholder="Payment reference number" className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500" />
              <textarea rows={2} value={payment.remarks} onChange={(event) => setPayment((value) => ({ ...value, remarks: event.target.value }))} placeholder="Remarks" className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setPaymentTarget(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600">Cancel</button>
              <button onClick={() => void markPaid()} disabled={isPending(`reimbursement-payment:${paymentTarget.id}`)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-60">
                {isPending(`reimbursement-payment:${paymentTarget.id}`) ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-5">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-gray-900 font-semibold">Delete reimbursement request?</h3>
            <p className="text-gray-500 mt-2 text-sm">Are you sure you want to delete this reimbursement request?</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600">Cancel</button>
              <button onClick={() => void remove()} disabled={isPending(`reimbursement-delete:${deleteTarget.id}`)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold disabled:opacity-60">
                {isPending(`reimbursement-delete:${deleteTarget.id}`) ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
