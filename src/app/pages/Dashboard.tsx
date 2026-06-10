'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  CalendarDays,
  ClipboardCheck,
  TrendingUp,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Sun,
  Users,
  Zap,
  Download,
  Loader2,
  ReceiptText,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AttendanceRecord, AttendanceStatus, LeaveRequest, ReimbursementRequest, User } from '../types';
import { formatDisplayTime } from '@/lib/time';
import { useActionRunner } from '@/app/hooks/useActionRunner';
import { mapReimbursementRequest } from '@/lib/supabase/mappers';
import { downloadAttendanceSnapshot, type AttendanceSnapshotRow } from '@/lib/attendance-snapshot';

const TODAY = new Date().toISOString().split('T')[0];

function formatDateLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const TODAY_LABEL = formatDateLabel(TODAY);

function getStatusBadge(status: string) {
  switch (status) {
    case 'present': return { label: 'Present', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' };
    case 'late': return { label: 'Late', cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' };
    case 'checked-in-only': return { label: 'Checked In Only', cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' };
    case 'absent': return { label: 'Absent', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
    case 'on-leave': return { label: 'On Leave', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };
    case 'half-day': return { label: 'Half Day', cls: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' };
    case 'holiday': return { label: 'Holiday', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' };
    case 'weekly-off': return { label: 'Weekly Off', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-500' };
    default: return { label: 'Not In', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' };
  }
}

function getLeaveStatusBadge(status: LeaveRequest['status']) {
  switch (status) {
    case 'approved': return { label: 'Approved', cls: 'bg-green-100 text-green-700' };
    case 'rejected': return { label: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'pending_manager': return { label: 'Pending Manager', cls: 'bg-yellow-100 text-yellow-700' };
    case 'pending_project_manager': return { label: 'Pending Project Manager', cls: 'bg-amber-100 text-amber-700' };
    case 'pending_director': return { label: 'Pending Director', cls: 'bg-orange-100 text-orange-700' };
  }
}

function getLeaveTypeLabel(type: string) {
  switch (type) {
    case 'sick': return 'Sick Leave';
    case 'emergency': return 'Emergency Leave';
    case 'casual': return 'Casual Leave';
    case 'annual': return 'Annual Leave';
    default: return type;
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDuration(checkIn?: string, checkOut?: string) {
  if (!checkIn || !checkOut) return null;
  const [h1, m1] = checkIn.split(':').map(Number);
  const [h2, m2] = checkOut.split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) return null;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function minutesFromTime(value?: string) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

// ─── Admin Daily Attendance Board ──────────────────────────────────────────────
function AdminDailyBoard() {
  const { users, attendanceRecords } = useApp();

  const activeUsers = users.filter((u) => u.isActive);
  const todayRecords = attendanceRecords.filter((r) => r.date === TODAY);

  const getRecord = (userId: string) =>
    todayRecords.find((r) => r.userId === userId);

  const counts = {
    present: activeUsers.filter((u) => {
      const r = getRecord(u.id);
      return r?.status === 'present';
    }).length,
    late: activeUsers.filter((u) => getRecord(u.id)?.status === 'late').length,
    absent: activeUsers.filter((u) => {
      const r = getRecord(u.id);
      return !r || r.status === 'absent';
    }).length,
    onLeave: activeUsers.filter((u) => getRecord(u.id)?.status === 'on-leave').length,
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Board Header — designed to look great as a screenshot */}
      <div className="bg-gradient-to-r from-green-700 to-green-600 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>PowerMatix</p>
              <p className="text-green-200" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>
                DAILY ATTENDANCE REPORT
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white" style={{ fontSize: '13px', fontWeight: 600 }}>{TODAY_LABEL}</p>
            <p className="text-green-200" style={{ fontSize: '11px' }}>Auto-generated · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {[
            { label: 'Present', value: counts.present, bg: 'bg-white/20', text: 'text-white' },
            { label: 'Late', value: counts.late, bg: 'bg-yellow-400/30', text: 'text-yellow-100' },
            { label: 'Absent', value: counts.absent, bg: 'bg-red-400/30', text: 'text-red-100' },
            { label: 'On Leave', value: counts.onLeave, bg: 'bg-blue-400/30', text: 'text-blue-100' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} px-3 py-1.5 rounded-xl flex items-center gap-2`}>
              <span className={`${s.text}`} style={{ fontSize: '18px', fontWeight: 700 }}>{s.value}</span>
              <span className={`${s.text} opacity-80`} style={{ fontSize: '11px', fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
          <div className="ml-auto bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-green-200" />
            <span className="text-green-100" style={{ fontSize: '12px', fontWeight: 500 }}>
              {activeUsers.length} Total
            </span>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 gap-0 px-4 py-2 border-b border-gray-100 bg-gray-50">
        {[
          { label: 'Employee', span: 'col-span-4' },
          { label: 'Reporting', span: 'col-span-2 text-center' },
          { label: 'Check In', span: 'col-span-2 text-center' },
          { label: 'Rank', span: 'col-span-1 text-center' },
          { label: 'Check Out', span: 'col-span-2 text-center' },
          { label: 'Status', span: 'col-span-1 text-center' },
        ].map((col) => (
          <div key={col.label} className={`${col.span}`}>
            <span className="text-gray-400 uppercase" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em' }}>
              {col.label}
            </span>
          </div>
        ))}
      </div>

      {/* Employee rows */}
      <div className="divide-y divide-gray-50">
        {activeUsers.map((user, idx) => {
          const record = getRecord(user.id);
          const badge = getStatusBadge(record?.status ?? 'absent');
          const duration = getDuration(record?.checkIn, record?.checkOut);

          return (
            <div
              key={user.id}
              className={`grid grid-cols-12 gap-0 px-4 py-3 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
            >
              {/* Name */}
              <div className="col-span-4 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  record?.checkIn ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <span className={`${record?.checkIn ? 'text-green-700' : 'text-gray-500'}`}
                    style={{ fontSize: '11px', fontWeight: 700 }}>
                    {user.name.split(' ').map((n) => n[0]).join('')}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 truncate" style={{ fontSize: '13px', fontWeight: 600 }}>{user.name}</p>
                  <p className="text-gray-400 truncate" style={{ fontSize: '11px' }}>{user.position}</p>
                </div>
              </div>

              {/* Project */}
              <div className="col-span-3">
                <p className="text-gray-600 truncate" style={{ fontSize: '12px' }}>{user.project ?? 'Unassigned'}</p>
              </div>

              {/* Check In */}
              <div className="col-span-2 text-center">
                {record?.checkIn ? (
                  <span className="text-green-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 600 }}>
                    {formatDisplayTime(record.checkIn)}
                  </span>
                ) : (
                  <span className="text-gray-300" style={{ fontSize: '13px' }}>—</span>
                )}
              </div>

              {/* Check Out */}
              <div className="col-span-2 text-center">
                {record?.checkOut ? (
                  <div>
                    <span className="text-blue-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 600 }}>
                      {formatDisplayTime(record.checkOut)}
                    </span>
                    {duration && (
                      <p className="text-gray-400" style={{ fontSize: '10px' }}>{duration}</p>
                    )}
                  </div>
                ) : record?.checkIn ? (
                  <span className="text-orange-400" style={{ fontSize: '11px' }}>Active</span>
                ) : (
                  <span className="text-gray-300" style={{ fontSize: '13px' }}>—</span>
                )}
              </div>

              {/* Status */}
              <div className="col-span-1 flex justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${badge.dot}`} title={badge.label} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Board footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {[
            { dot: 'bg-green-500', label: 'Present' },
            { dot: 'bg-yellow-500', label: 'Late' },
            { dot: 'bg-red-500', label: 'Absent' },
            { dot: 'bg-blue-500', label: 'On Leave' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${l.dot}`} />
              <span className="text-gray-400" style={{ fontSize: '10px' }}>{l.label}</span>
            </div>
          ))}
        </div>
        <p className="text-gray-300" style={{ fontSize: '10px' }}>powermatix.com</p>
      </div>
    </div>
  );
}

// ─── Employee Dashboard ─────────────────────────────────────────────────────────
function getBoardRows(users: User[], attendanceRecords: AttendanceRecord[], selectedDate: string) {
  const activeUsers = users.filter((user) => user.isActive);
  const dateRecords = attendanceRecords.filter((record) => record.date === selectedDate);

  const rows = activeUsers.map((user) => {
    const record = dateRecords.find((item) => item.userId === user.id);
    const status = (record?.status ?? 'absent') as AttendanceStatus | 'absent';
    const badge = getStatusBadge(status);
    return {
      user,
      record,
      status,
      badge,
      snapshot: {
        employeeName: user.name,
        position: user.position,
        project: user.project ?? 'Unassigned',
        reportingTime: user.reportingTime,
        checkIn: record?.checkIn,
        checkOut: record?.checkOut,
        statusLabel: badge.label,
        status,
      } satisfies AttendanceSnapshotRow,
    };
  });

  const ranks = new Map<string, number>();
  rows
    .filter(({ record }) => Boolean(record?.checkIn))
    .sort((a, b) => (minutesFromTime(a.record?.checkIn) ?? 9999) - (minutesFromTime(b.record?.checkIn) ?? 9999))
    .forEach((row, index) => ranks.set(row.user.id, index + 1));

  return rows.map((row) => ({ ...row, rank: ranks.get(row.user.id) }));
}

function getBoardSummary(rows: ReturnType<typeof getBoardRows>) {
  return {
    present: rows.filter(({ status }) => status === 'present' || status === 'checked-in-only').length,
    late: rows.filter(({ status }) => status === 'late').length,
    absent: rows.filter(({ status }) => status === 'absent').length,
    onLeave: rows.filter(({ status }) => status === 'on-leave').length,
    total: rows.length,
  };
}

function DynamicAdminDailyBoard({
  selectedDate,
  rows,
  summary,
}: {
  selectedDate: string;
  rows: ReturnType<typeof getBoardRows>;
  summary: ReturnType<typeof getBoardSummary>;
}) {
  const selectedDateLabel = formatDateLabel(selectedDate);
  const generatedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-green-700 to-green-600 px-4 sm:px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>PowerMatix</p>
              <p className="text-green-200" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>
                DAILY ATTENDANCE REPORT
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-white" style={{ fontSize: '13px', fontWeight: 600 }}>{selectedDateLabel}</p>
            <p className="text-green-200" style={{ fontSize: '11px' }}>Auto-generated - {generatedAt}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          {[
            { label: 'Present', value: summary.present, bg: 'bg-white/20', text: 'text-white' },
            { label: 'Late', value: summary.late, bg: 'bg-yellow-400/30', text: 'text-yellow-100' },
            { label: 'Absent', value: summary.absent, bg: 'bg-red-400/30', text: 'text-red-100' },
            { label: 'On Leave', value: summary.onLeave, bg: 'bg-blue-400/30', text: 'text-blue-100' },
          ].map((item) => (
            <div key={item.label} className={`${item.bg} px-3 py-1.5 rounded-xl flex items-center gap-2`}>
              <span className={`${item.text}`} style={{ fontSize: '18px', fontWeight: 700 }}>{item.value}</span>
              <span className={`${item.text} opacity-80`} style={{ fontSize: '11px', fontWeight: 500 }}>{item.label}</span>
            </div>
          ))}
          <div className="sm:ml-auto bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-green-200" />
            <span className="text-green-100" style={{ fontSize: '12px', fontWeight: 500 }}>
              {summary.total} Total
            </span>
          </div>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-12 gap-0 px-4 py-2 border-b border-gray-100 bg-gray-50">
        {[
          { label: 'Employee', span: 'col-span-4' },
          { label: 'Project', span: 'col-span-3' },
          { label: 'Check In', span: 'col-span-2 text-center' },
          { label: 'Check Out', span: 'col-span-2 text-center' },
          { label: 'Status', span: 'col-span-1 text-center' },
        ].map((col) => (
          <div key={col.label} className={col.span}>
            <span className="text-gray-400 uppercase" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em' }}>
              {col.label}
            </span>
          </div>
        ))}
      </div>

      <div className="hidden md:block divide-y divide-gray-50">
        {rows.map(({ user, record, badge, rank }, idx) => {
          const duration = getDuration(record?.checkIn, record?.checkOut);
          return (
            <div
              key={user.id}
              className={`grid grid-cols-12 gap-0 px-4 py-3 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
            >
              <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${record?.checkIn ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <span className={`${record?.checkIn ? 'text-green-700' : 'text-gray-500'}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                    {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 truncate" style={{ fontSize: '13px', fontWeight: 600 }}>{user.name}</p>
                  <p className="text-gray-400 truncate" style={{ fontSize: '11px' }}>{user.position}</p>
                </div>
              </div>
              <div className="col-span-2 text-center">
                <p className="text-gray-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 700 }}>{formatDisplayTime(user.reportingTime)}</p>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-green-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 600 }}>
                  {formatDisplayTime(record?.checkIn)}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <span className={`inline-flex min-w-7 justify-center rounded-lg px-2 py-1 text-xs font-bold ${
                  rank ? (rank <= 3 ? 'bg-green-100 text-green-700' : rank <= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-400'
                }`}>
                  {rank ?? 'NA'}
                </span>
              </div>
              <div className="col-span-2 text-center">
                {record?.checkOut ? (
                  <div>
                    <span className="text-blue-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 600 }}>
                      {formatDisplayTime(record.checkOut)}
                    </span>
                    {duration && <p className="text-gray-400" style={{ fontSize: '10px' }}>{duration}</p>}
                  </div>
                ) : record?.checkIn ? (
                  <span className="text-orange-400" style={{ fontSize: '11px' }}>Active</span>
                ) : (
                  <span className="text-gray-300" style={{ fontSize: '13px' }}>-</span>
                )}
              </div>
              <div className="col-span-1 flex justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${badge.dot}`} title={badge.label} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="md:hidden divide-y divide-gray-50">
        {rows.map(({ user, record, badge, rank }) => (
          <div key={user.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${record?.checkIn ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <span className={`${record?.checkIn ? 'text-green-700' : 'text-gray-500'}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                    {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 truncate" style={{ fontSize: '13px', fontWeight: 700 }}>{user.name}</p>
                  <p className="text-gray-400 truncate" style={{ fontSize: '11px' }}>{user.project ?? 'Unassigned'}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-lg ${badge.cls}`} style={{ fontSize: '10px', fontWeight: 700 }}>
                {badge.label}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-gray-400" style={{ fontSize: '10px', fontWeight: 700 }}>REPORTING</p>
                <p className="text-gray-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 700 }}>{formatDisplayTime(user.reportingTime)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-gray-400" style={{ fontSize: '10px', fontWeight: 700 }}>RANK</p>
                <p className="text-gray-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 700 }}>{rank ?? 'NA'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-gray-400" style={{ fontSize: '10px', fontWeight: 700 }}>CHECK IN</p>
                <p className="text-green-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 700 }}>{formatDisplayTime(record?.checkIn)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-gray-400" style={{ fontSize: '10px', fontWeight: 700 }}>CHECK OUT</p>
                <p className="text-blue-700 tabular-nums" style={{ fontSize: '13px', fontWeight: 700 }}>
                  {record?.checkOut ? formatDisplayTime(record.checkOut) : record?.checkIn ? 'Active' : '-'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { dot: 'bg-green-500', label: 'Present' },
            { dot: 'bg-yellow-500', label: 'Late' },
            { dot: 'bg-red-500', label: 'Absent' },
            { dot: 'bg-blue-500', label: 'On Leave' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${item.dot}`} />
              <span className="text-gray-400" style={{ fontSize: '10px' }}>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="text-gray-300" style={{ fontSize: '10px' }}>powermatix.com</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currentUser, users, getTodayRecord, leaveRequests, attendanceRecords, checkIn, checkOut } = useApp();
  const { isPending, runAction } = useActionRunner();
  const router = useRouter();
  const todayRecord = getTodayRecord();

  const [checkInFeedback, setCheckInFeedback] = useState(false);
  const [checkOutFeedback, setCheckOutFeedback] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);
  const [adminBoardDate, setAdminBoardDate] = useState(TODAY);

  const myLeaveRequests = leaveRequests.filter((r) => r.userId === currentUser?.id).slice(0, 3);

  const pendingApprovalsCount = leaveRequests.filter((r) => {
    if (!currentUser) return false;
    const pendingApproval = r.approvals.find((approval) => approval.status === 'pending');
    if (!pendingApproval) return false;
    return currentUser.role === 'admin' || pendingApproval.approverId === currentUser.id;
  }).length;

  const myRecords = attendanceRecords.filter((r) => r.userId === currentUser?.id);
  const presentDays = myRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
  const leaveDays = myRecords.filter((r) => r.status === 'on-leave').length;
  const attendancePercentage = myRecords.length > 0 ? Math.round((presentDays / myRecords.length) * 100) : 0;

  const isAdmin = currentUser?.role === 'admin';
  const isDirector = currentUser?.role === 'director';
  const canCheckIn = !todayRecord?.checkIn;
  const canCheckOut = !!todayRecord?.checkIn && !todayRecord?.checkOut;
  const adminBoardRows = getBoardRows(users, attendanceRecords, adminBoardDate);
  const adminBoardSummary = getBoardSummary(adminBoardRows);

  useEffect(() => {
    if (!isAdmin && !isDirector) return;
    fetch('/api/reimbursements', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (body?.data) setReimbursements(body.data.map(mapReimbursementRequest));
      })
      .catch(() => {
        setReimbursements([]);
      });
  }, [isAdmin, isDirector]);

  const directorPendingReimbursements = reimbursements.filter((request) =>
    request.approvals.some((approval) => approval.status === 'pending' && approval.role === 'Director'),
  );
  const directorPendingAmount = directorPendingReimbursements.reduce((sum, request) => sum + request.amount, 0);

  const handleCheckIn = async () => {
    if (!canCheckIn) return;
    await runAction('dashboard-check-in', async () => {
      setActionError(null);
      await checkIn();
      setCheckInFeedback(true);
      setTimeout(() => setCheckInFeedback(false), 2500);
    }, {
      loading: 'Recording check-in...',
      success: 'Checked in successfully.',
      error: 'Unable to check in right now.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to check in right now.');
    });
  };

  const handleCheckOut = async () => {
    if (!canCheckOut) return;
    await runAction('dashboard-check-out', async () => {
      setActionError(null);
      await checkOut();
      setCheckOutFeedback(true);
      setTimeout(() => setCheckOutFeedback(false), 2500);
    }, {
      loading: 'Recording check-out...',
      success: 'Checked out successfully.',
      error: 'Unable to check out right now.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to check out right now.');
    });
  };
  const handleBoardSnapshot = () => {
    downloadAttendanceSnapshot({
      dateLabel: formatDateLabel(adminBoardDate),
      generatedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      rows: adminBoardRows.map((row) => row.snapshot),
      summary: adminBoardSummary,
    });
  };
  const checkingIn = isPending('dashboard-check-in');
  const checkingOut = isPending('dashboard-check-out');

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Welcome header ── */}
      <div className="bg-gradient-to-r from-green-600 to-green-500 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-green-200" />
            <p className="text-green-100" style={{ fontSize: '13px' }}>{TODAY_LABEL}</p>
          </div>
          {todayRecord && (
            <span className={`px-2.5 py-1 rounded-full ${
              todayRecord.status === 'present' ? 'bg-white/20 text-white' : 'bg-yellow-300/30 text-yellow-100'
            }`} style={{ fontSize: '11px', fontWeight: 600 }}>
              {getStatusBadge(todayRecord.status).label}
            </span>
          )}
        </div>
        <h1 className="text-white mt-1" style={{ fontSize: '22px', fontWeight: 700 }}>
          {getGreeting()}, {currentUser?.name.split(' ')[0]}
        </h1>
        <p className="text-green-100 mt-0.5" style={{ fontSize: '13px' }}>
          {currentUser?.position} · {currentUser?.project ?? 'Unassigned'}
        </p>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* ── Big Circular Check In / Check Out ── */}
      <div>
        <h2 className="text-gray-700 mb-4" style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Today's Attendance
        </h2>

        <div className="flex items-center justify-center gap-6 md:gap-10">
          {/* Check In Button */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {/* Pulse ring when ready */}
              {canCheckIn && (
                <span className="absolute inset-0 rounded-full bg-green-400 opacity-20 animate-ping" />
              )}
              <button
                onClick={() => void handleCheckIn()}
                disabled={!canCheckIn || checkingIn}
                className={`relative w-36 h-36 md:w-40 md:h-40 rounded-full flex flex-col items-center justify-center gap-1.5 shadow-xl transition-all duration-200
                  ${canCheckIn && !checkingIn
                    ? 'bg-gradient-to-br from-green-400 to-green-700 hover:scale-105 active:scale-95 hover:shadow-green-300/50 hover:shadow-2xl cursor-pointer'
                    : todayRecord?.checkIn
                    ? 'bg-gradient-to-br from-green-500 to-green-700 cursor-default opacity-90'
                    : 'bg-gray-200 cursor-not-allowed'
                  }`}
              >
                {/* Inner ring */}
                <div className={`absolute inset-2 rounded-full border-2 ${canCheckIn || todayRecord?.checkIn ? 'border-white/20' : 'border-gray-300/30'}`} />

                {checkingIn ? (
                  <>
                    <Loader2 className="w-8 h-8 text-white drop-shadow animate-spin" />
                    <span className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>Checking In</span>
                    <span className="text-white/70" style={{ fontSize: '11px' }}>One moment</span>
                  </>
                ) : todayRecord?.checkIn ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-white drop-shadow" />
                    <span className="text-white tabular-nums" style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>
                      {formatDisplayTime(todayRecord.checkIn)}
                    </span>
                    <span className="text-green-100" style={{ fontSize: '11px', fontWeight: 500 }}>Checked In</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-8 h-8 text-white/90 drop-shadow" />
                    <span className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>Check In</span>
                    <span className="text-white/70" style={{ fontSize: '11px' }}>Tap to punch</span>
                  </>
                )}
              </button>
            </div>

            {checkInFeedback && (
              <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Punched in!</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <div className="w-px h-8 bg-gray-200" />
            <span style={{ fontSize: '11px' }}>vs</span>
            <div className="w-px h-8 bg-gray-200" />
          </div>

          {/* Check Out Button */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {canCheckOut && (
                <span className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-ping" />
              )}
              <button
                onClick={() => void handleCheckOut()}
                disabled={!canCheckOut || checkingOut}
                className={`relative w-36 h-36 md:w-40 md:h-40 rounded-full flex flex-col items-center justify-center gap-1.5 shadow-xl transition-all duration-200
                  ${canCheckOut && !checkingOut
                    ? 'bg-gradient-to-br from-blue-400 to-blue-700 hover:scale-105 active:scale-95 hover:shadow-blue-300/50 hover:shadow-2xl cursor-pointer'
                    : todayRecord?.checkOut
                    ? 'bg-gradient-to-br from-blue-500 to-blue-700 cursor-default opacity-90'
                    : 'bg-gray-200 cursor-not-allowed'
                  }`}
              >
                <div className={`absolute inset-2 rounded-full border-2 ${canCheckOut || todayRecord?.checkOut ? 'border-white/20' : 'border-gray-300/30'}`} />

                {checkingOut ? (
                  <>
                    <Loader2 className="w-8 h-8 text-white drop-shadow animate-spin" />
                    <span className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>Checking Out</span>
                    <span className="text-white/70" style={{ fontSize: '11px' }}>One moment</span>
                  </>
                ) : todayRecord?.checkOut ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-white drop-shadow" />
                    <span className="text-white tabular-nums" style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>
                      {formatDisplayTime(todayRecord.checkOut)}
                    </span>
                    <span className="text-blue-100" style={{ fontSize: '11px', fontWeight: 500 }}>Checked Out</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-8 h-8 text-white/90 drop-shadow" />
                    <span className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>Check Out</span>
                    <span className="text-white/70" style={{ fontSize: '11px' }}>
                      {!todayRecord?.checkIn ? 'Check in first' : 'Tap to punch'}
                    </span>
                  </>
                )}
              </button>
            </div>

            {checkOutFeedback && (
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Punched out!</span>
              </div>
            )}
          </div>
        </div>

        {/* Duration summary if both punched */}
        {todayRecord?.checkIn && todayRecord?.checkOut && (
          <div className="mt-5 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 px-5 py-2.5 rounded-full">
              <Clock className="w-4 h-4 text-green-600" />
              <span className="text-green-700" style={{ fontSize: '14px', fontWeight: 600 }}>
                Total: {getDuration(todayRecord.checkIn, todayRecord.checkOut) ?? '—'}
              </span>
              <span className="text-green-400" style={{ fontSize: '12px' }}>today</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Admin: Daily Attendance Board ── */}
      {isAdmin && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h2 className="text-gray-700" style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Daily Attendance Board
            </h2>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="date"
                value={adminBoardDate}
                onChange={(event) => setAdminBoardDate(event.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
              <button
                onClick={handleBoardSnapshot}
                className="text-gray-500 bg-gray-100 px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
                <Download className="w-4 h-4" />
                Screenshot to share
              </button>
            </div>
          </div>
          <DynamicAdminDailyBoard selectedDate={adminBoardDate} rows={adminBoardRows} summary={adminBoardSummary} />
        </div>
      )}

      {(isAdmin || isDirector) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <ReceiptText className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 700 }}>Reimbursements Awaiting Approval</h2>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: '12px' }}>
                  Director and admin visibility for pending reimbursement claims
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/reimbursements')}
              className="bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors text-sm font-semibold"
            >
              Review
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-orange-50 p-3">
              <p className="text-orange-700 text-xs font-semibold">Pending Count</p>
              <p className="text-gray-900 text-xl font-bold mt-1">{directorPendingReimbursements.length}</p>
            </div>
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-green-700 text-xs font-semibold">Pending Amount</p>
              <p className="text-gray-900 text-xl font-bold mt-1">PKR {directorPendingAmount.toLocaleString('en-US')}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-red-700 text-xs font-semibold">High Priority</p>
              <p className="text-gray-900 text-xl font-bold mt-1">{directorPendingReimbursements.filter((request) => request.amount >= 10000).length}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Action tiles ── */}
      <div>
        <h2 className="text-gray-700 mb-3" style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Leave Request',
              description: 'Apply for time off',
              icon: CalendarDays,
              bg: 'bg-purple-50',
              iconColor: 'text-purple-600',
              path: '/leave?new=1',
            },
            {
              label: 'Reimbursements',
              description: 'Submit expense claims',
              icon: ReceiptText,
              bg: 'bg-green-50',
              iconColor: 'text-green-600',
              path: '/reimbursements?new=1',
            },
            {
              label: 'Approvals',
              description: pendingApprovalsCount > 0 ? `${pendingApprovalsCount} awaiting review` : 'No pending',
              icon: ClipboardCheck,
              bg: pendingApprovalsCount > 0 ? 'bg-orange-50' : 'bg-gray-50',
              iconColor: pendingApprovalsCount > 0 ? 'text-orange-500' : 'text-gray-400',
              badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
              path: '/approvals',
            },
            ...(isAdmin ? [
              {
                label: 'User Management',
                description: 'Manage team',
                icon: Users,
                bg: 'bg-indigo-50',
                iconColor: 'text-indigo-600',
                path: '/admin/users',
              },
              {
                label: 'Attendance Report',
                description: 'Correct records',
                icon: Clock,
                bg: 'bg-amber-50',
                iconColor: 'text-amber-600',
                path: '/admin/attendance',
              },
            ] : [
              {
                label: 'My History',
                description: 'View attendance log',
                icon: Clock,
                bg: 'bg-blue-50',
                iconColor: 'text-blue-600',
                path: '/attendance',
              },
              {
                label: 'Monthly Stats',
                description: `${presentDays} days present`,
                icon: TrendingUp,
                bg: 'bg-green-50',
                iconColor: 'text-green-600',
                path: '/attendance',
              },
            ]),
          ].map((card) => (
            <button
              key={card.label}
              onClick={() => router.push(card.path)}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left group hover:border-green-100 relative"
            >
              {card.badge && (
                <span className="absolute top-3 right-3 w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center"
                  style={{ fontSize: '10px', fontWeight: 700 }}>
                  {card.badge}
                </span>
              )}
              <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                <card.icon className={`w-4.5 h-4.5 ${card.iconColor}`} />
              </div>
              <p className="text-gray-900" style={{ fontSize: '13px', fontWeight: 600 }}>{card.label}</p>
              <p className="text-gray-400 mt-0.5" style={{ fontSize: '11px' }}>{card.description}</p>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Monthly stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Days Present', value: presentDays, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Days on Leave', value: leaveDays, icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Attendance %', value: `${attendancePercentage}%`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-gray-900" style={{ fontSize: '20px', fontWeight: 700 }}>{stat.value}</p>
            <p className="text-gray-500" style={{ fontSize: '11px' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Recent leave requests ── */}
      {myLeaveRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>My Leave Requests</h2>
            <button onClick={() => router.push('/leave')} className="text-green-600 flex items-center gap-1"
              style={{ fontSize: '13px', fontWeight: 500 }}>
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {myLeaveRequests.map((req) => {
              const badge = getLeaveStatusBadge(req.status);
              return (
                <div key={req.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CalendarDays className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-gray-900" style={{ fontSize: '13px', fontWeight: 500 }}>
                        {getLeaveTypeLabel(req.type)}
                      </p>
                      <p className="text-gray-400" style={{ fontSize: '12px' }}>
                        {req.startDate} → {req.endDate} · {req.totalDays}d
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-lg ${badge.cls}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Manager pending alert ── */}
      {pendingApprovalsCount > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-orange-700" style={{ fontSize: '14px', fontWeight: 600 }}>
                {pendingApprovalsCount} request{pendingApprovalsCount > 1 ? 's' : ''} awaiting your approval
              </p>
              <p className="text-orange-400" style={{ fontSize: '12px' }}>Action required</p>
            </div>
          </div>
          <button onClick={() => router.push('/approvals')}
            className="bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors flex-shrink-0"
            style={{ fontSize: '13px', fontWeight: 500 }}>
            Review
          </button>
        </div>
      )}
    </div>
  );
}
