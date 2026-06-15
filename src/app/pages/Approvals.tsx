'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  ReceiptText,
  User,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { LeaveApproval, LeaveRequest, ReimbursementApproval, ReimbursementRequest } from '../types';
import { mapReimbursementRequest } from '@/lib/supabase/mappers';
import { useActionRunner } from '@/app/hooks/useActionRunner';
import { getVisibleUserIdsForHierarchy } from '@/lib/hierarchy';

type StatusTab = 'pending' | 'all';
type CategoryTab = 'all' | 'leave' | 'reimbursement' | 'attendance';
type ReimbursementDecision = 'approved' | 'rejected' | 'more_info';

function getLeaveTypeLabel(type: string) {
  switch (type) {
    case 'sick': return 'Sick Leave';
    case 'minor_sick': return 'Minor Sick Leave';
    case 'emergency': return 'Emergency Leave';
    case 'casual': return 'Casual Leave';
    case 'annual': return 'Annual Leave';
    case 'paternity': return 'Paternity Leave';
    case 'marriage': return 'Marriage Leave';
    case 'hajj': return 'Hajj Leave';
    case 'umrah': return 'Umrah Leave';
    default: return type;
  }
}

function getLeaveTypeColor(type: string) {
  switch (type) {
    case 'sick':
    case 'minor_sick': return 'bg-red-50 text-red-600';
    case 'emergency': return 'bg-rose-50 text-rose-600';
    case 'casual': return 'bg-blue-50 text-blue-600';
    case 'annual': return 'bg-purple-50 text-purple-600';
    case 'paternity': return 'bg-cyan-50 text-cyan-600';
    case 'marriage': return 'bg-pink-50 text-pink-600';
    case 'hajj': return 'bg-emerald-50 text-emerald-600';
    case 'umrah': return 'bg-teal-50 text-teal-600';
    default: return 'bg-gray-50 text-gray-600';
  }
}

function formatDateTime(value?: string) {
  if (!value) return 'Pending';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function currentPendingApproval(request: LeaveRequest) {
  return request.approvals.find((approval) => approval.status === 'pending');
}

function currentPendingReimbursementApproval(request: ReimbursementRequest) {
  return request.approvals.find((approval) => approval.status === 'pending');
}

function previousApprovalComments<T extends LeaveApproval | ReimbursementApproval>(approvals: T[], level: number) {
  return approvals.filter((approval) => approval.level < level && approval.comment?.trim());
}

function canActOnApproval(
  approval: LeaveApproval | ReimbursementApproval | undefined,
  currentUserId?: string,
) {
  if (!approval || !currentUserId) return false;
  return approval.approverId === currentUserId;
}

function canActOnReimbursementApproval(
  approval: ReimbursementApproval | undefined,
  currentUserId?: string,
  currentUserRole?: string,
) {
  if (!approval || !currentUserId) return false;
  return (
    (currentUserRole === 'admin' && approval.level === 1) ||
    (currentUserRole === 'director' && approval.level === 2 && approval.approverId === currentUserId)
  );
}

function Timeline({
  submittedBy,
  submittedAt,
  approvals,
  finalLabel,
}: {
  submittedBy: string;
  submittedAt?: string;
  approvals: Array<LeaveApproval | ReimbursementApproval>;
  finalLabel?: string;
}) {
  const steps = [
    {
      label: 'Submitted',
      sublabel: submittedBy,
      date: submittedAt,
      status: 'approved',
      comment: undefined,
    },
    ...approvals.map((approval) => ({
      label: approval.role,
      sublabel: approval.approverName,
      date: approval.timestamp,
      status: approval.status,
      comment: approval.comment,
    })),
  ];

  if (finalLabel) {
    steps.push({
      label: finalLabel,
      sublabel: 'Final processing',
      date: undefined,
      status: 'pending',
      comment: undefined,
    });
  }

  return (
    <div className="flex flex-col">
      {steps.map((step, idx) => {
        const done = step.status === 'approved';
        const rejected = step.status === 'rejected';
        const moreInfo = step.status === 'more_info';
        return (
          <div key={`${step.label}-${idx}`} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 ${
                  done
                    ? 'bg-green-600 border-green-600 shadow-sm shadow-green-200'
                    : rejected
                      ? 'bg-red-500 border-red-500 shadow-sm shadow-red-200'
                      : moreInfo
                        ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-200'
                        : 'bg-white border-gray-200'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : rejected ? (
                  <XCircle className="w-4 h-4 text-white" />
                ) : moreInfo ? (
                  <FileText className="w-4 h-4 text-white" />
                ) : (
                  <Clock className="w-4 h-4 text-gray-300" />
                )}
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-0.5 flex-1 min-h-[2rem] mt-1 rounded-full ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>

            <div className={`flex-1 pt-1 ${idx < steps.length - 1 ? 'pb-5' : 'pb-1'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={`${
                      done ? 'text-green-700' : rejected ? 'text-red-600' : moreInfo ? 'text-blue-600' : 'text-gray-400'
                    }`}
                    style={{ fontSize: '13px', fontWeight: 600 }}
                  >
                    {step.label}
                  </p>
                  <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>
                    {step.sublabel}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full flex-shrink-0 ${
                    done ? 'bg-green-50 text-green-600' : rejected ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'
                  }`}
                  style={{ fontSize: '11px', fontWeight: 500 }}
                >
                  {formatDateTime(step.date)}
                </span>
              </div>
              {step.comment && (
                <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                  <p className="text-gray-500" style={{ fontSize: '12px', lineHeight: '1.5' }}>
                    "{step.comment}"
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreviousComments({
  approvals,
  level,
}: {
  approvals: Array<LeaveApproval | ReimbursementApproval>;
  level: number;
}) {
  const comments = previousApprovalComments(approvals, level);
  if (comments.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-green-100 bg-green-50/60 px-3 py-2">
      <p className="text-green-700" style={{ fontSize: '11px', fontWeight: 600 }}>
        Previous Approval Comments
      </p>
      <div className="mt-2 space-y-2">
        {comments.map((approval) => (
          <div key={`${approval.level}-${approval.timestamp ?? approval.role}`} className="rounded-lg bg-white/80 px-3 py-2 border border-green-100">
            <div className="flex items-center justify-between gap-2">
              <p className="text-gray-700" style={{ fontSize: '12px', fontWeight: 600 }}>
                {approval.role} - {approval.approverName}
              </p>
              <span className="text-gray-400" style={{ fontSize: '11px' }}>
                {formatDateTime(approval.timestamp)}
              </span>
            </div>
            <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px', lineHeight: '1.5' }}>
              "{approval.comment}"
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaveApprovalCard({
  request,
  canApprove,
  approvalLevel,
  onApprove,
  onReject,
  isProcessing,
}: {
  request: LeaveRequest;
  canApprove: boolean;
  approvalLevel: 1 | 2;
  onApprove: (id: string, level: 1 | 2, comment: string) => Promise<void>;
  onReject: (id: string, level: 1 | 2, comment: string) => Promise<void>;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [comment, setComment] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const typeColor = getLeaveTypeColor(request.type);

  const handleAction = async () => {
    if (!actionType) return;
    if (actionType === 'reject' && !comment.trim()) {
      setLocalError('Please add a rejection comment so the next person has full context.');
      return;
    }
    setLocalError(null);
    try {
      if (actionType === 'approve') {
        await onApprove(request.id, approvalLevel, comment);
      } else {
        await onReject(request.id, approvalLevel, comment);
      }
    } catch {
      return;
    }
    setShowActionForm(false);
    setComment('');
    setActionType(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center flex-shrink-0">
              <CalendarDays className="w-4 h-4 text-purple-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 600 }}>{request.userName}</p>
                <span className={`px-2 py-0.5 rounded-lg ${typeColor}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                  {getLeaveTypeLabel(request.type)}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500" style={{ fontSize: '11px', fontWeight: 600 }}>
                  Leave
                </span>
              </div>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>{request.userProject}</p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0 transition-colors"
            aria-label={expanded ? 'Hide approval timeline' : 'Show approval timeline'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <p className="text-gray-400" style={{ fontSize: '10px' }}>Date Range</p>
              <p className="text-gray-700" style={{ fontSize: '12px', fontWeight: 500 }}>
                {request.startDate} to {request.endDate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <p className="text-gray-400" style={{ fontSize: '10px' }}>Duration</p>
              <p className="text-gray-700" style={{ fontSize: '12px', fontWeight: 500 }}>
                {request.totalDays} day{request.totalDays > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-gray-400" style={{ fontSize: '10px' }}>Reason</p>
          <p className="text-gray-700 mt-0.5" style={{ fontSize: '13px' }}>{request.reason}</p>
        </div>

        <PreviousComments approvals={request.approvals} level={approvalLevel} />

        {canApprove && !showActionForm && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { setActionType('approve'); setShowActionForm(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all"
              style={{ fontSize: '13px', fontWeight: 600 }}
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={() => { setActionType('reject'); setShowActionForm(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-all"
              style={{ fontSize: '13px', fontWeight: 600 }}
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        )}

        {showActionForm && (
          <div className={`mt-3 rounded-xl border p-3 ${actionType === 'approve' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
            <p className={`mb-2 ${actionType === 'approve' ? 'text-green-700' : 'text-red-600'}`} style={{ fontSize: '13px', fontWeight: 600 }}>
              {actionType === 'approve' ? 'Approving this request' : 'Rejecting this request'}
            </p>
            <textarea
              rows={2}
              placeholder={actionType === 'approve' ? 'Add a comment (optional)...' : 'Rejection comment required...'}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setLocalError(null);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500 resize-none"
              style={{ fontSize: '13px' }}
            />
            {localError && <p className="mt-2 text-red-600" style={{ fontSize: '12px' }}>{localError}</p>}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setShowActionForm(false); setActionType(null); setComment(''); setLocalError(null); }}
                disabled={isProcessing}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white transition-all"
                style={{ fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAction()}
                disabled={isProcessing}
                className={`flex-1 py-2 rounded-lg text-white transition-all ${
                  actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                style={{ fontSize: '13px', fontWeight: 600 }}
              >
                {isProcessing ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : `Confirm ${actionType === 'approve' ? 'Approval' : 'Rejection'}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
          <p className="text-gray-600 mb-3" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Approval Timeline
          </p>
          <Timeline submittedBy={request.userName} submittedAt={request.submittedAt} approvals={request.approvals} />
        </div>
      )}
    </div>
  );
}

function ReimbursementApprovalCard({
  request,
  canApprove,
  approvalLevel,
  onDecision,
  isProcessing,
}: {
  request: ReimbursementRequest;
  canApprove: boolean;
  approvalLevel: 1 | 2;
  onDecision: (request: ReimbursementRequest, level: 1 | 2, decision: ReimbursementDecision, comment: string) => Promise<void>;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionType, setActionType] = useState<ReimbursementDecision | null>(null);
  const [comment, setComment] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const timelineApprovals = request.approvals.map((approval) => ({
    ...approval,
    role: approval.level === 1 ? 'Admin' : approval.level === 2 ? 'Director' : approval.role,
    approverName:
      approval.level === 1 && approval.role !== 'Admin'
        ? 'Admin'
        : approval.level === 2 && approval.role !== 'Director'
          ? 'Director'
          : approval.approverName,
  }));

  const handleAction = async () => {
    if (!actionType) return;
    if ((actionType === 'rejected' || actionType === 'more_info') && !comment.trim()) {
      setLocalError('Please add a comment so the employee and next approver have context.');
      return;
    }
    setLocalError(null);
    try {
      await onDecision(request, approvalLevel, actionType, comment);
    } catch {
      return;
    }
    setActionType(null);
    setComment('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center flex-shrink-0">
              <ReceiptText className="w-4 h-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 600 }}>{request.userName}</p>
                <span className="px-2 py-0.5 rounded-lg bg-green-50 text-green-700" style={{ fontSize: '11px', fontWeight: 600 }}>
                  Reimbursement
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500" style={{ fontSize: '11px', fontWeight: 600 }}>
                  {request.categoryName}
                </span>
              </div>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>
                {request.requestNumber} - {request.userProject}
              </p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0 transition-colors"
            aria-label={expanded ? 'Hide reimbursement timeline' : 'Show reimbursement timeline'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400" style={{ fontSize: '10px' }}>Amount</p>
            <p className="text-gray-800" style={{ fontSize: '12px', fontWeight: 700 }}>{formatMoney(request.amount, request.currency)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400" style={{ fontSize: '10px' }}>Expense Date</p>
            <p className="text-gray-700" style={{ fontSize: '12px', fontWeight: 500 }}>{request.expenseDate}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400" style={{ fontSize: '10px' }}>Project</p>
            <p className="text-gray-700 truncate" style={{ fontSize: '12px', fontWeight: 500 }}>{request.project ?? request.userProject}</p>
          </div>
        </div>

        <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-gray-400" style={{ fontSize: '10px' }}>Description</p>
          <p className="text-gray-700 mt-0.5" style={{ fontSize: '13px' }}>{request.description}</p>
        </div>

        <PreviousComments approvals={request.approvals} level={approvalLevel} />

        {canApprove && !actionType && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setActionType('approved')} className="flex-1 min-w-[120px] py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-semibold">
              Approve
            </button>
            <button onClick={() => setActionType('rejected')} className="flex-1 min-w-[120px] py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 text-sm font-semibold">
              Reject
            </button>
            <button onClick={() => setActionType('more_info')} className="flex-1 min-w-[120px] py-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl hover:bg-blue-100 text-sm font-semibold">
              More Info
            </button>
          </div>
        )}

        {actionType && (
          <div className="mt-3 rounded-xl border border-green-100 bg-green-50 p-3">
            <p className="mb-2 text-green-700 text-sm font-semibold">
              {actionType === 'approved' ? 'Approving reimbursement' : actionType === 'rejected' ? 'Rejecting reimbursement' : 'Requesting more information'}
            </p>
            <textarea
              rows={2}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setLocalError(null);
              }}
              placeholder={actionType === 'approved' ? 'Comment (optional)' : 'Comment required'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
            />
            {localError && <p className="mt-2 text-red-600 text-xs">{localError}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setActionType(null); setComment(''); setLocalError(null); }} disabled={isProcessing} className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white text-sm">
                Cancel
              </button>
              <button onClick={() => void handleAction()} disabled={isProcessing} className="flex-1 py-2 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-60 text-sm">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
          <p className="text-gray-600 mb-3" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Approval Timeline
          </p>
          <Timeline
            submittedBy={request.userName}
            submittedAt={request.submittedAt ?? request.createdAt}
            approvals={timelineApprovals}
            finalLabel={request.status === 'paid' ? undefined : 'Payment'}
          />
        </div>
      )}
    </div>
  );
}

export default function Approvals() {
  const router = useRouter();
  const { currentUser, users, leaveRequests, approveLeave } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);
  const [loadingReimbursements, setLoadingReimbursements] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isApprover = ['manager', 'director', 'admin'].includes(currentUser?.role ?? '');
  const visibleUserIds = useMemo(() => getVisibleUserIdsForHierarchy(currentUser, users), [currentUser, users]);

  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;

    const loadReimbursements = async () => {
      setLoadingReimbursements(true);
      const response = await fetch('/api/reimbursements', { credentials: 'include' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to load reimbursements.');
      const body = await response.json();
      if (isMounted) setReimbursements((body.data ?? []).map(mapReimbursementRequest));
    };

    void loadReimbursements()
      .catch((error) => {
        if (isMounted) setActionError(error instanceof Error ? error.message : 'Unable to load reimbursements.');
      })
      .finally(() => {
        if (isMounted) setLoadingReimbursements(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const leaveVisibleToMe = useMemo(
    () =>
      leaveRequests.filter((request) => {
        if (!currentUser) return false;
        if (!isApprover) return request.userId === currentUser.id;
        if (currentUser.role === 'admin' || currentUser.role === 'director') return true;
        return visibleUserIds.has(request.userId) || request.approvals.some((approval) => approval.approverId === currentUser.id);
      }),
    [currentUser, isApprover, leaveRequests, visibleUserIds],
  );

  const reimbursementVisibleToMe = useMemo(
    () =>
      reimbursements.filter((request) => {
        if (!currentUser) return false;
        if (currentUser.role === 'manager' || !isApprover) return request.userId === currentUser.id;
        if (currentUser.role === 'admin' || currentUser.role === 'director') return true;
        return request.userId === currentUser.id;
      }),
    [currentUser, isApprover, reimbursements],
  );

  const pendingLeavesForMe = leaveVisibleToMe.filter((request) =>
    canActOnApproval(currentPendingApproval(request), currentUser?.id),
  );

  const pendingReimbursementsForMe = reimbursementVisibleToMe.filter((request) =>
    canActOnReimbursementApproval(currentPendingReimbursementApproval(request), currentUser?.id, currentUser?.role),
  );

  const visibleLeaves = statusTab === 'pending' ? pendingLeavesForMe : leaveVisibleToMe;
  const visibleReimbursements = statusTab === 'pending' ? pendingReimbursementsForMe : reimbursementVisibleToMe;

  const showLeaves = categoryTab === 'all' || categoryTab === 'leave';
  const showReimbursements = categoryTab === 'all' || categoryTab === 'reimbursement';
  const showAttendance = categoryTab === 'attendance';

  const getApprovalLevel = (request: LeaveRequest): 1 | 2 => {
    const pendingApproval = currentPendingApproval(request);
    return pendingApproval?.level === 2 ? 2 : 1;
  };

  const getReimbursementApprovalLevel = (request: ReimbursementRequest): 1 | 2 => {
    const pendingApproval = currentPendingReimbursementApproval(request);
    return pendingApproval?.level === 2 ? 2 : 1;
  };

  const handleApprove = async (id: string, level: 1 | 2, comment: string) => {
    await runAction(`approval:${id}`, async () => {
      setActionError(null);
      await approveLeave(id, level, true, comment);
    }, {
      loading: 'Approving leave request...',
      success: 'Leave request approved.',
      error: 'Unable to approve this request.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to approve this request.');
      throw error;
    });
  };

  const handleReject = async (id: string, level: 1 | 2, comment: string) => {
    await runAction(`approval:${id}`, async () => {
      setActionError(null);
      await approveLeave(id, level, false, comment);
    }, {
      loading: 'Rejecting leave request...',
      success: 'Leave request rejected.',
      error: 'Unable to reject this request.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to reject this request.');
      throw error;
    });
  };

  const handleReimbursementDecision = async (
    request: ReimbursementRequest,
    level: 1 | 2,
    decision: ReimbursementDecision,
    comment: string,
  ) => {
    await runAction(`reimbursement-approval:${request.id}`, async () => {
      setActionError(null);
      const response = await fetch('/api/reimbursements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'approval',
          reimbursementId: request.id,
          level,
          decision,
          comment,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Unable to update reimbursement approval.');
      const body = await response.json();
      const updated = mapReimbursementRequest(body.data);
      setReimbursements((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    }, {
      loading: 'Updating reimbursement approval...',
      success: 'Reimbursement approval updated.',
      error: 'Unable to update reimbursement approval.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to update reimbursement approval.');
      throw error;
    });
  };

  const emptyVisible =
    (showLeaves ? visibleLeaves.length : 0) +
    (showReimbursements ? visibleReimbursements.length : 0) === 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>Approval Center</h1>
        <p className="text-gray-500 mt-1" style={{ fontSize: '14px' }}>
          {isApprover ? 'Review leave, reimbursement, and attendance approval work from one place.' : 'Track your submitted approval requests.'}
        </p>
      </div>

      {isApprover && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Needs My Action', value: pendingLeavesForMe.length + pendingReimbursementsForMe.length, color: 'text-orange-600', bg: 'bg-orange-50', icon: Clock },
            { label: 'Leave Items', value: visibleLeaves.length, color: 'text-purple-600', bg: 'bg-purple-50', icon: CalendarDays },
            { label: 'Reimbursements', value: visibleReimbursements.length, color: 'text-green-600', bg: 'bg-green-50', icon: ReceiptText },
            { label: 'Rejected', value: leaveVisibleToMe.filter((r) => r.status === 'rejected').length + reimbursementVisibleToMe.filter((r) => r.status === 'rejected').length, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mb-2`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>{stat.value}</p>
              <p className="text-gray-400" style={{ fontSize: '11px' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {isApprover && (
        <div className="space-y-3 mb-5">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {[
              { key: 'pending', label: `Needs My Action${pendingLeavesForMe.length + pendingReimbursementsForMe.length > 0 ? ` (${pendingLeavesForMe.length + pendingReimbursementsForMe.length})` : ''}` },
              { key: 'all', label: 'All Visible Requests' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key as StatusTab)}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  statusTab === tab.key ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                style={{ fontSize: '13px', fontWeight: statusTab === tab.key ? 600 : 500 }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { key: 'all', label: 'All', count: visibleLeaves.length + visibleReimbursements.length, icon: ClipboardCheck },
              { key: 'leave', label: 'Leave', count: visibleLeaves.length, icon: CalendarDays },
              { key: 'reimbursement', label: 'Reimbursements', count: visibleReimbursements.length, icon: ReceiptText },
              { key: 'attendance', label: 'Attendance', count: 0, icon: FileText },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCategoryTab(tab.key as CategoryTab)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border whitespace-nowrap transition-all ${
                  categoryTab === tab.key
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50'
                }`}
                style={{ fontSize: '13px', fontWeight: 600 }}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs">{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {actionError && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {loadingReimbursements && (
        <div className="mb-4 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-500 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Refreshing reimbursement approvals...
        </div>
      )}

      {showAttendance && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center mb-4">
          <AlertCircle className="w-10 h-10 text-amber-300 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold">Attendance corrections are handled from the attendance admin board.</p>
          <p className="text-gray-400 text-sm mt-1">This keeps attendance edits auditable and separate from leave and expense approvals.</p>
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => router.push('/admin/attendance')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
            >
              Open Attendance Board
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {!showAttendance && emptyVisible && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-600" style={{ fontSize: '16px', fontWeight: 500 }}>
            {statusTab === 'pending' ? 'No pending approvals' : 'No requests found'}
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: '14px' }}>
            {statusTab === 'pending' ? "You're all caught up." : 'No matching approval requests are available.'}
          </p>
        </div>
      )}

      {!showAttendance && !emptyVisible && (
        <div className="space-y-3">
          {showLeaves && visibleLeaves.map((request) => {
            const pendingApproval = currentPendingApproval(request);
            const isPendingForMe = canActOnApproval(pendingApproval, currentUser?.id);

            return (
              <LeaveApprovalCard
                key={`leave-${request.id}`}
                request={request}
                canApprove={isPendingForMe}
                approvalLevel={getApprovalLevel(request)}
                onApprove={handleApprove}
                onReject={handleReject}
                isProcessing={isPending(`approval:${request.id}`)}
              />
            );
          })}

          {showReimbursements && visibleReimbursements.map((request) => {
            const pendingApproval = currentPendingReimbursementApproval(request);
            const isPendingForMe = canActOnReimbursementApproval(pendingApproval, currentUser?.id, currentUser?.role);

            return (
              <ReimbursementApprovalCard
                key={`reimbursement-${request.id}`}
                request={request}
                canApprove={isPendingForMe}
                approvalLevel={getReimbursementApprovalLevel(request)}
                onDecision={handleReimbursementDecision}
                isProcessing={isPending(`reimbursement-approval:${request.id}`)}
              />
            );
          })}
        </div>
      )}

      {!isApprover && !showAttendance && emptyVisible && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <User className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500" style={{ fontSize: '14px' }}>You have no requests to track.</p>
        </div>
      )}
    </div>
  );
}
