'use client';

import { useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  User,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LeaveRequest } from '../types';
import { useActionRunner } from '@/app/hooks/useActionRunner';

function getLeaveTypeLabel(type: string) {
  switch (type) {
    case 'sick': return 'Sick Leave';
    case 'emergency': return 'Emergency Leave';
    case 'casual': return 'Casual Leave';
    case 'annual': return 'Annual Leave';
    default: return type;
  }
}

function getLeaveTypeColor(type: string) {
  switch (type) {
    case 'sick': return 'bg-red-50 text-red-600';
    case 'emergency': return 'bg-rose-50 text-rose-600';
    case 'casual': return 'bg-blue-50 text-blue-600';
    case 'annual': return 'bg-purple-50 text-purple-600';
    default: return 'bg-gray-50 text-gray-600';
  }
}

function currentPendingApproval(request: LeaveRequest) {
  return request.approvals.find((approval) => approval.status === 'pending');
}

function previousApprovalComments(request: LeaveRequest, level: 1 | 2 | 3) {
  return request.approvals.filter((approval) => approval.level < level && approval.comment?.trim());
}

function ApprovalStepper({ request }: { request: LeaveRequest }) {
  const steps = [
    {
      label: 'Submitted',
      sublabel: request.userName,
      date: new Date(request.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      status: 'done' as const,
      comment: undefined,
    },
    ...request.approvals.map((a) => ({
      label: a.role,
      sublabel: a.approverName,
      date: a.timestamp ? new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
      status: a.status === 'approved' ? 'done' as const : a.status === 'rejected' ? 'rejected' as const : 'pending' as const,
      comment: a.comment,
    })),
  ];

  return (
    <div className="flex flex-col">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-start gap-3">
          {/* Left column: circle node + vertical connector */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 ${
                step.status === 'done'
                  ? 'bg-green-600 border-green-600 shadow-sm shadow-green-200'
                  : step.status === 'rejected'
                  ? 'bg-red-500 border-red-500 shadow-sm shadow-red-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              {step.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : step.status === 'rejected' ? (
                <XCircle className="w-4 h-4 text-white" />
              ) : (
                <Clock className="w-4 h-4 text-gray-300" />
              )}
            </div>
            {/* Connector line going DOWN */}
            {idx < steps.length - 1 && (
              <div
                className={`w-0.5 flex-1 min-h-[2rem] mt-1 rounded-full ${
                  step.status === 'done' ? 'bg-green-300' : 'bg-gray-200'
                }`}
              />
            )}
          </div>

          {/* Right column: content */}
          <div className={`flex-1 pt-1 ${idx < steps.length - 1 ? 'pb-5' : 'pb-1'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p
                  className={`${
                    step.status === 'done'
                      ? 'text-green-700'
                      : step.status === 'rejected'
                      ? 'text-red-600'
                      : 'text-gray-400'
                  }`}
                  style={{ fontSize: '13px', fontWeight: 600 }}
                >
                  {step.label}
                </p>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>
                  {step.sublabel}
                </p>
              </div>
              {step.date && (
                <span
                  className={`px-2 py-0.5 rounded-full flex-shrink-0 ${
                    step.status === 'done'
                      ? 'bg-green-50 text-green-600'
                      : step.status === 'rejected'
                      ? 'bg-red-50 text-red-500'
                      : 'bg-gray-50 text-gray-400'
                  }`}
                  style={{ fontSize: '11px', fontWeight: 500 }}
                >
                  {step.date}
                </span>
              )}
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
      ))}
    </div>
  );
}

function RequestCard({
  request,
  canApprove,
  approvalLevel,
  onApprove,
  onReject,
  isProcessing,
}: {
  request: LeaveRequest;
  canApprove: boolean;
  approvalLevel: 1 | 2 | 3;
  onApprove: (id: string, level: 1 | 2 | 3, comment: string) => Promise<void>;
  onReject: (id: string, level: 1 | 2 | 3, comment: string) => Promise<void>;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [comment, setComment] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const priorComments = previousApprovalComments(request, approvalLevel);

  const handleAction = async () => {
    if (!actionType) return;
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

  const typeColor = getLeaveTypeColor(request.type);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-gray-600" style={{ fontSize: '13px', fontWeight: 600 }}>
                {request.userName.split(' ').map((n) => n[0]).join('')}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 600 }}>{request.userName}</p>
                <span className={`px-2 py-0.5 rounded-lg ${typeColor}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                  {getLeaveTypeLabel(request.type)}
                </span>
              </div>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>{request.userProject}</p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <p className="text-gray-400" style={{ fontSize: '10px' }}>Date Range</p>
              <p className="text-gray-700" style={{ fontSize: '12px', fontWeight: 500 }}>
                {request.startDate} → {request.endDate}
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

        {priorComments.length > 0 && (
          <div className="mt-3 rounded-lg border border-green-100 bg-green-50/60 px-3 py-2">
            <p className="text-green-700" style={{ fontSize: '11px', fontWeight: 600 }}>
              Previous Approval Comments
            </p>
            <div className="mt-2 space-y-2">
              {priorComments.map((approval) => (
                <div key={approval.level} className="rounded-lg bg-white/80 px-3 py-2 border border-green-100">
                  <p className="text-gray-700" style={{ fontSize: '12px', fontWeight: 600 }}>
                    {approval.role}
                  </p>
                  <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px', lineHeight: '1.5' }}>
                    "{approval.comment}"
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons for pending approvals */}
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

        {/* Action form */}
        {showActionForm && (
          <div className={`mt-3 rounded-xl border p-3 ${
            actionType === 'approve' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
          }`}>
            <p className={`mb-2 ${actionType === 'approve' ? 'text-green-700' : 'text-red-600'}`}
              style={{ fontSize: '13px', fontWeight: 600 }}>
              {actionType === 'approve' ? '✓ Approving this request' : '✗ Rejecting this request'}
            </p>
            <textarea
              rows={2}
              placeholder="Add a comment (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500 resize-none"
              style={{ fontSize: '13px' }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setShowActionForm(false); setActionType(null); setComment(''); }}
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

      {/* Expanded: approval timeline */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
          <p className="text-gray-600 mb-3" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Approval Timeline
          </p>
          <ApprovalStepper request={request} />
        </div>
      )}
    </div>
  );
}

export default function Approvals() {
  const { currentUser, leaveRequests, approveLeave } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [actionError, setActionError] = useState<string | null>(null);

  // Requests I need to approve
  const pendingForMe = leaveRequests.filter((request) => {
    if (!currentUser) return false;
    const pendingApproval = currentPendingApproval(request);
    if (!pendingApproval) return false;
    return currentUser.role === 'admin' || pendingApproval.approverId === currentUser.id;
  });

  // All requests (for manager/admin view)
  const allRequests = leaveRequests.filter((r) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return r.approvals.some((a) => a.approverId === currentUser.id);
  });

  const getApprovalLevel = (request: LeaveRequest): 1 | 2 | 3 => {
    const pendingApproval = currentPendingApproval(request);
    return (pendingApproval?.level ?? 1) as 1 | 2 | 3;
  };

  const handleApprove = async (id: string, level: 1 | 2 | 3, comment: string) => {
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

  const handleReject = async (id: string, level: 1 | 2 | 3, comment: string) => {
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

  const isApprover = ['manager', 'director', 'admin'].includes(currentUser?.role ?? '');
  const displayList = activeTab === 'pending' ? pendingForMe : allRequests;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>Approval Requests</h1>
        <p className="text-gray-500 mt-1" style={{ fontSize: '14px' }}>
          {isApprover ? 'Review and manage leave requests' : 'Track the status of your leave approvals'}
        </p>
      </div>

      {/* Stats */}
      {isApprover && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Pending', value: pendingForMe.length, color: 'text-orange-600', bg: 'bg-orange-50', icon: Clock },
            { label: 'Approved', value: allRequests.filter((r) => r.status === 'approved').length, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
            { label: 'Rejected', value: allRequests.filter((r) => r.status === 'rejected').length, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
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

      {/* Tabs */}
      {isApprover && (
        <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-1">
          {[
            { key: 'pending', label: `Needs My Action${pendingForMe.length > 0 ? ` (${pendingForMe.length})` : ''}` },
            { key: 'all', label: 'All Requests' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'pending' | 'all')}
              className={`flex-1 py-2 rounded-lg transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ fontSize: '13px', fontWeight: activeTab === tab.key ? 600 : 500 }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Request cards */}
      {actionError && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {isApprover && (displayList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-600" style={{ fontSize: '16px', fontWeight: 500 }}>
            {activeTab === 'pending' ? 'No pending approvals' : 'No requests found'}
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: '14px' }}>
            {activeTab === 'pending'
              ? "You're all caught up! No leave requests need your review."
              : 'No leave requests have been submitted yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map((request) => {
            const pendingApproval = currentPendingApproval(request);
            const isPendingForMe = Boolean(
              pendingApproval &&
              (currentUser?.role === 'admin' || pendingApproval.approverId === currentUser?.id),
            );

            return (
              <RequestCard
                key={request.id}
                request={request}
                canApprove={isPendingForMe}
                approvalLevel={getApprovalLevel(request)}
                onApprove={handleApprove}
                onReject={handleReject}
                isProcessing={isPending(`approval:${request.id}`)}
              />
            );
          })}
        </div>
      ))}

      {/* For non-approver employees: show their requests */}
      {!isApprover && (
        <div className="space-y-3">
          {leaveRequests
            .filter((r) => r.userId === currentUser?.id)
            .map((request) => (
              <div key={request.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg ${getLeaveTypeColor(request.type)}`}
                        style={{ fontSize: '12px', fontWeight: 600 }}>
                        {getLeaveTypeLabel(request.type)}
                      </span>
                      <span className="text-gray-400" style={{ fontSize: '12px' }}>
                        {request.totalDays} day{request.totalDays > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-500 mb-4" style={{ fontSize: '12px' }}>
                    {request.startDate} → {request.endDate}
                  </p>
                  <ApprovalStepper request={request} />
                </div>
              </div>
            ))}

          {leaveRequests.filter((r) => r.userId === currentUser?.id).length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <User className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500" style={{ fontSize: '14px' }}>You have no leave requests to track.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
