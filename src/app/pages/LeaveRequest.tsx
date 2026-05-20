'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, PlusCircle, Clock, CheckCircle2, XCircle, ChevronRight, Info, Edit3, Save, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LeaveType, LeaveRequest, PolicySettings } from '../types';
import { useActionRunner } from '@/app/hooks/useActionRunner';

const TODAY = new Date().toISOString().split('T')[0];

function getLeaveTypeLabel(type: LeaveType) {
  switch (type) {
    case 'sick': return 'Sick Leave';
    case 'emergency': return 'Emergency Leave';
    case 'casual': return 'Casual Leave';
    case 'annual': return 'Annual Leave';
  }
}

function getLeaveTypeColor(type: LeaveType) {
  switch (type) {
    case 'sick': return { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' };
    case 'emergency': return { bg: 'bg-rose-50', text: 'text-rose-600', dot: 'bg-rose-400' };
    case 'casual': return { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-400' };
    case 'annual': return { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-400' };
  }
}

function getStatusBadge(status: LeaveRequest['status']) {
  switch (status) {
    case 'approved': return { label: 'Approved', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 };
    case 'rejected': return { label: 'Rejected', cls: 'bg-red-100 text-red-700', icon: XCircle };
    case 'pending_manager': return { label: 'Pending Manager', cls: 'bg-yellow-100 text-yellow-700', icon: Clock };
    case 'pending_project_manager': return { label: 'Pending Project Manager', cls: 'bg-amber-100 text-amber-700', icon: Clock };
    case 'pending_director': return { label: 'Pending Director', cls: 'bg-orange-100 text-orange-700', icon: Clock };
  }
}

export default function LeaveRequestPage() {
  const { currentUser, leaveRequests, submitLeaveRequest } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'annual' as LeaveType,
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [policy, setPolicy] = useState<PolicySettings>({
    defaultReportingTime: '09:00',
    checkInGraceMinutes: 15,
    globalReportingTime: '09:00',
    globalGracePeriod: 15,
    checkOutReminderTime: '19:00',
    sickLeaveDays: 10,
    emergencyLeaveDays: 5,
    casualLeaveDays: 10,
    annualLeaveDays: 14,
    casualLeaveNoticeHours: 48,
    annualLeaveNoticeHours: 48,
    leavePolicyNotes:
      'Sick leave can be used for medical illness or treatment and does not require advance notice.\nEmergency leave can be used for urgent personal or family situations and does not require advance notice.\nCasual leave is for planned short personal time away and requires advance notice.\nAnnual leave is for planned vacations or longer breaks and requires advance notice.',
  });

  useEffect(() => {
    fetch('/api/admin/policies', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) return null;
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? 'Unable to load leave policy information.');
        }
        return response.json();
      })
      .then((body) => {
        if (body?.data) setPolicy(body.data);
      })
      .catch((error) => {
        setPolicyError(error instanceof Error ? error.message : 'Unable to load leave policy information.');
      });
  }, []);

  const myRequests = leaveRequests
    .filter((r) => r.userId === currentUser?.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const getTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.startDate) errs.startDate = 'Start date is required';
    if (!form.endDate) errs.endDate = 'End date is required';
    if (form.startDate && form.startDate <= TODAY) errs.startDate = 'Leave must be scheduled for a future date';
    if (form.endDate && form.startDate && form.endDate < form.startDate) errs.endDate = 'End date must be on or after start date';
    if (!form.reason.trim()) errs.reason = 'Please provide a reason';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    await runAction('leave-submit', async () => {
      setSubmitError(null);
      await submitLeaveRequest(form);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setShowForm(false);
        setForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
        setErrors({});
      }, 2500);
    }, {
      loading: 'Submitting leave request...',
      success: 'Leave request submitted.',
      error: 'Unable to submit your leave request.',
    }).catch((error) => {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit your leave request.');
    });
  };

  const approvedDays = myRequests.filter((request) => request.status === 'approved').reduce((sum, request) => sum + request.totalDays, 0);
  const pendingDays = myRequests
    .filter((request) => request.status === 'pending_manager' || request.status === 'pending_project_manager' || request.status === 'pending_director')
    .reduce((sum, request) => sum + request.totalDays, 0);
  const rejectedRequests = myRequests.filter((request) => request.status === 'rejected').length;
  const canEditPolicy = currentUser?.role === 'admin' || currentUser?.role === 'director';

  const savePolicy = async () => {
    await runAction('leave-policy-save', async () => {
      setSavingPolicy(true);
      setPolicyError(null);
      const response = await fetch('/api/admin/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to save leave policy information.');
      }

      setEditingPolicy(false);
    }, {
      loading: 'Saving policy...',
      success: 'Leave policy saved.',
      error: 'Unable to save leave policy information.',
    }).catch((error) => {
      setPolicyError(error instanceof Error ? error.message : 'Unable to save leave policy information.');
    }).finally(() => {
      setSavingPolicy(false);
    });
  };
  const submittingLeave = isPending('leave-submit');
  const savingLeavePolicy = savingPolicy || isPending('leave-policy-save');

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>Leave Requests</h1>
          <p className="text-gray-500 mt-1" style={{ fontSize: '14px' }}>Apply for time off or track your requests</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl hover:bg-green-700 transition-all shadow-sm"
            style={{ fontSize: '14px', fontWeight: 500 }}
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">New Request</span>
          </button>
        )}
      </div>

      {/* Leave Request Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-gray-900" style={{ fontSize: '16px', fontWeight: 600 }}>Leave Policy Information</h2>
            <p className="text-gray-500 mt-1" style={{ fontSize: '13px' }}>
              Eligibility and notice requirements for each leave category
            </p>
          </div>
          {canEditPolicy && (
            <button
              onClick={() => (editingPolicy ? void savePolicy() : setEditingPolicy(true))}
              disabled={savingLeavePolicy}
              className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 transition-all disabled:opacity-60"
              style={{ fontSize: '13px', fontWeight: 600 }}
            >
              {savingLeavePolicy ? <Loader2 className="w-4 h-4 animate-spin" /> : editingPolicy ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {savingLeavePolicy ? 'Saving...' : editingPolicy ? 'Save Policy' : 'Edit Policy'}
            </button>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ['Sick Leave Days', 'sickLeaveDays'],
              ['Emergency Leave Days', 'emergencyLeaveDays'],
              ['Casual Leave Days', 'casualLeaveDays'],
              ['Annual Leave Days', 'annualLeaveDays'],
              ['Casual Leave Notice (Hours)', 'casualLeaveNoticeHours'],
              ['Annual Leave Notice (Hours)', 'annualLeaveNoticeHours'],
            ].map(([label, key]) => (
              <label key={key} className="text-sm text-gray-600">
                {label}
                {editingPolicy ? (
                  <input
                    type="number"
                    min={0}
                    value={policy[key as keyof PolicySettings] as number}
                    onChange={(event) =>
                      setPolicy((value) => ({
                        ...value,
                        [key]: Number(event.target.value),
                      }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                  />
                ) : (
                  <div className="mt-1 px-3 py-2 rounded-xl bg-gray-50 text-gray-900">
                    {policy[key as keyof PolicySettings]}
                  </div>
                )}
              </label>
            ))}
          </div>

          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="w-full">
              <p className="text-blue-700 mb-2" style={{ fontSize: '12px', fontWeight: 600 }}>
                Policy Notes
              </p>
              {editingPolicy ? (
                <textarea
                  rows={5}
                  value={policy.leavePolicyNotes}
                  onChange={(event) => setPolicy((value) => ({ ...value, leavePolicyNotes: event.target.value }))}
                  className="w-full px-3 py-2 border border-blue-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  style={{ fontSize: '13px', lineHeight: '1.6' }}
                />
              ) : (
                <p className="text-blue-600 whitespace-pre-line" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                  {policy.leavePolicyNotes}
                </p>
              )}
            </div>
          </div>

          {!editingPolicy && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-gray-700">
                Sick and Emergency leave do not require notice hours.
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-gray-700">
                Casual requires {policy.casualLeaveNoticeHours} hours notice. Annual requires {policy.annualLeaveNoticeHours} hours notice.
              </div>
            </div>
          )}

          {policyError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {policyError}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-green-500 px-5 py-4">
            <h2 className="text-white" style={{ fontSize: '16px', fontWeight: 600 }}>New Leave Request</h2>
            <p className="text-green-100 mt-0.5" style={{ fontSize: '13px' }}>Submit your leave for approval</p>
          </div>

          {submitted ? (
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-gray-900" style={{ fontSize: '16px', fontWeight: 600 }}>Request Submitted!</p>
              <p className="text-gray-500 mt-2" style={{ fontSize: '14px' }}>
                Your leave request has been sent for approval.
              </p>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Leave type */}
              <div>
                <label className="block text-gray-700 mb-2" style={{ fontSize: '14px', fontWeight: 500 }}>Leave Type</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(['sick', 'emergency', 'casual', 'annual'] as LeaveType[]).map((type) => {
                    const colors = getLeaveTypeColor(type);
                    return (
                      <button
                        key={type}
                        onClick={() => setForm((f) => ({ ...f, type }))}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          form.type === type
                            ? `${colors.bg} border-current ${colors.text}`
                            : 'border-gray-100 hover:border-gray-200 text-gray-600'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full mb-2 ${form.type === type ? colors.dot : 'bg-gray-300'}`} />
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{getLeaveTypeLabel(type)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: '14px', fontWeight: 500 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    min={getTomorrow()}
                    value={form.startDate}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, startDate: e.target.value }));
                      setErrors((err) => ({ ...err, startDate: '' }));
                    }}
                    className={`w-full px-3 py-2.5 border rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      errors.startDate ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                    style={{ fontSize: '14px' }}
                  />
                  {errors.startDate && <p className="mt-1 text-red-500" style={{ fontSize: '12px' }}>{errors.startDate}</p>}
                </div>
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: '14px', fontWeight: 500 }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    min={form.startDate || getTomorrow()}
                    value={form.endDate}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, endDate: e.target.value }));
                      setErrors((err) => ({ ...err, endDate: '' }));
                    }}
                    className={`w-full px-3 py-2.5 border rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      errors.endDate ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                    style={{ fontSize: '14px' }}
                  />
                  {errors.endDate && <p className="mt-1 text-red-500" style={{ fontSize: '12px' }}>{errors.endDate}</p>}
                </div>
              </div>

              {/* Duration preview */}
              {form.startDate && form.endDate && form.endDate >= form.startDate && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2.5 rounded-xl">
                  <CalendarDays className="w-4 h-4" />
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>
                    {Math.ceil((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} day(s) of{' '}
                    {getLeaveTypeLabel(form.type)}
                  </span>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: '14px', fontWeight: 500 }}>
                  Reason / Comment
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide a brief reason for your leave request..."
                  value={form.reason}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, reason: e.target.value }));
                    setErrors((err) => ({ ...err, reason: '' }));
                  }}
                  className={`w-full px-3 py-2.5 border rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all resize-none ${
                    errors.reason ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                  style={{ fontSize: '14px' }}
                />
                {errors.reason && <p className="mt-1 text-red-500" style={{ fontSize: '12px' }}>{errors.reason}</p>}
              </div>

              {/* Policy note */}
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-blue-600" style={{ fontSize: '12px', lineHeight: '1.5' }}>
                  Leave requests require approval from your Line Manager, Project Manager, and Director before they are confirmed.
                  Sick and emergency leave do not require notice hours. Casual leave requires {policy.casualLeaveNoticeHours} hours notice and annual leave requires {policy.annualLeaveNoticeHours} hours notice.
                </p>
              </div>

              {submitError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {submitError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowForm(false); setErrors({}); }}
                  disabled={submittingLeave}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-all"
                  style={{ fontSize: '14px', fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSubmit()}
                  disabled={submittingLeave}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ fontSize: '14px', fontWeight: 600 }}
                >
                  {submittingLeave ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : 'Submit Request'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leave balance summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Approved Days', value: approvedDays, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Pending Days', value: pendingDays, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Rejected Requests', value: rejectedRequests, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className={`${stat.color} mb-2`} style={{ fontSize: '12px', fontWeight: 600 }}>
              {stat.label}
            </p>
            <p className="text-gray-900" style={{ fontSize: '20px', fontWeight: 700 }}>
              {stat.value}
            </p>
            <p className="text-gray-400" style={{ fontSize: '11px' }}>
              Live from Supabase
            </p>
          </div>
        ))}
      </div>

      {/* My leave history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>My Leave History</h2>
          <span className="text-gray-400" style={{ fontSize: '13px' }}>{myRequests.length} total</span>
        </div>

        {myRequests.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarDays className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400" style={{ fontSize: '14px' }}>No leave requests yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-green-600 flex items-center gap-1 mx-auto"
              style={{ fontSize: '13px', fontWeight: 500 }}
            >
              Submit your first request <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {myRequests.map((req) => {
              const badge = getStatusBadge(req.status);
              const StatusIcon = badge.icon;
              const typeColors = getLeaveTypeColor(req.type);
              return (
                <div key={req.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 ${typeColors.bg} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <CalendarDays className={`w-4 h-4 ${typeColors.text}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 600 }}>
                            {getLeaveTypeLabel(req.type)}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full ${badge.cls} flex items-center gap-1`}
                            style={{ fontSize: '11px', fontWeight: 600 }}>
                            <StatusIcon className="w-3 h-3" />
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>
                          {req.startDate} → {req.endDate} · {req.totalDays} day{req.totalDays > 1 ? 's' : ''}
                        </p>
                        <p className="text-gray-400 mt-0.5" style={{ fontSize: '12px' }}>
                          "{req.reason}"
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Approval progress */}
                  <div className="mt-3 ml-12 flex items-center gap-2">
                    {req.approvals.map((approval, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        {idx > 0 && <div className="w-6 h-px bg-gray-200" />}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                          approval.status === 'approved' ? 'bg-green-50 text-green-600' :
                          approval.status === 'rejected' ? 'bg-red-50 text-red-500' :
                          'bg-gray-50 text-gray-400'
                        }`}>
                          {approval.status === 'approved' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : approval.status === 'rejected' ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span style={{ fontSize: '11px', fontWeight: 500 }}>{approval.approverName.split(' ')[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
