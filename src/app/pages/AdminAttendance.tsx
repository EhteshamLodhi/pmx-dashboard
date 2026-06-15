'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit3, Loader2, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AttendanceRecord, AttendanceStatus, LeaveRequest, User } from '../types';
import { formatDisplayTime } from '@/lib/time';
import { useActionRunner } from '@/app/hooks/useActionRunner';
import { getVisibleUsersForHierarchy } from '@/lib/hierarchy';

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

function getStatusMeta(status: AttendanceStatus | 'absent') {
  switch (status) {
    case 'present': return { label: 'On Time', badge: 'bg-green-100 text-green-700', row: 'bg-green-50/65' };
    case 'late': return { label: 'Late', badge: 'bg-orange-100 text-orange-700', row: 'bg-orange-50/75' };
    case 'checked-in-only': return { label: 'Checked In Only', badge: 'bg-yellow-100 text-yellow-700', row: 'bg-yellow-50/60' };
    case 'on-leave': return { label: 'On Leave', badge: 'bg-blue-100 text-blue-700', row: 'bg-blue-50/60' };
    case 'holiday': return { label: 'Holiday', badge: 'bg-sky-100 text-sky-700', row: 'bg-sky-50/70' };
    case 'weekly-off': return { label: 'Weekly Off', badge: 'bg-gray-100 text-gray-600', row: 'bg-gray-50/80' };
    default: return { label: 'Absent (Not approved Leave)', badge: 'bg-red-100 text-red-700', row: 'bg-red-50/75' };
  }
}

function getLeaveTypeLabel(type?: string) {
  switch (type) {
    case 'sick': return 'Sick';
    case 'minor_sick': return 'Minor Sick';
    case 'emergency': return 'Emergency';
    case 'casual': return 'Casual';
    case 'annual': return 'Annual';
    case 'paternity': return 'Paternity';
    case 'marriage': return 'Marriage';
    case 'hajj': return 'Hajj';
    case 'umrah': return 'Umrah';
    default: return type ?? 'Approved Leave';
  }
}

function getApprovedLeaveForDate(leaveRequests: LeaveRequest[], userId: string, date: string) {
  return leaveRequests.find(
    (request) =>
      request.userId === userId &&
      request.status === 'approved' &&
      request.startDate <= date &&
      request.endDate >= date,
  );
}

function getStatusLabel(status: AttendanceStatus | 'absent', leave?: LeaveRequest) {
  if (status === 'on-leave') return `On Leave (${getLeaveTypeLabel(leave?.type)})`;
  return getStatusMeta(status).label;
}

function formatHours(record?: AttendanceRecord) {
  if (record?.totalHours) return `${record.totalHours}h`;
  if (!record?.checkIn || !record.checkOut) return '-';
  const [h1, m1] = record.checkIn.split(':').map(Number);
  const [h2, m2] = record.checkOut.split(':').map(Number);
  const diff = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diff <= 0) return '-';
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

export default function AdminAttendance() {
  const { users, attendanceRecords, leaveRequests, updateAttendanceRecord, addAttendanceRecord, currentUser } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [editing, setEditing] = useState<{ user: User; record?: AttendanceRecord } | null>(null);
  const [editForm, setEditForm] = useState({
    date: TODAY,
    checkIn: '',
    checkOut: '',
    status: 'present' as AttendanceStatus,
    notes: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const activeEmployees = useMemo(
    () => (currentUser ? getVisibleUsersForHierarchy(currentUser, users.filter((user) => user.isActive)) : []),
    [currentUser, users],
  );

  useEffect(() => {
    if (!activeEmployees.length) {
      setSelectedEmployeeId('');
      return;
    }
    if (!selectedEmployeeId || !activeEmployees.some((user) => user.id === selectedEmployeeId)) {
      setSelectedEmployeeId(activeEmployees[0].id);
    }
  }, [activeEmployees, selectedEmployeeId]);

  const selectedEmployee = activeEmployees.find((user) => user.id === selectedEmployeeId);
  const selectedEmployeeRecords = useMemo(
    () =>
      attendanceRecords
        .filter((record) => record.userId === selectedEmployeeId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attendanceRecords, selectedEmployeeId],
  );

  const openEdit = (user: User, record?: AttendanceRecord) => {
    setEditing({ user, record });
    setEditForm({
      date: record?.date ?? TODAY,
      checkIn: record?.checkIn ?? '',
      checkOut: record?.checkOut ?? '',
      status: record?.status ?? 'present',
      notes: record?.notes ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload = {
      userId: editing.user.id,
      date: editForm.date,
      checkIn: editForm.checkIn || undefined,
      checkOut: editForm.checkOut || undefined,
      status: editForm.status,
      notes: editForm.notes || undefined,
    };

    await runAction(`admin-attendance:${editing.user.id}:${editForm.date}`, async () => {
      setEditError(null);
      if (editing.record) {
        await updateAttendanceRecord(editing.record.id, payload);
      } else {
        await addAttendanceRecord(payload);
      }
      setEditing(null);
    }, {
      loading: 'Saving attendance update...',
      success: 'Attendance entry saved.',
      error: 'Unable to save this attendance update.',
    }).catch((error) => {
      setEditError(error instanceof Error ? error.message : 'Unable to save this attendance update.');
    });
  };
  const savingEdit = editing ? isPending(`admin-attendance:${editing.user.id}:${editForm.date}`) : false;

  const canEditAttendance = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  if (!canEditAttendance) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-red-700">
          <Shield className="w-6 h-6 mb-2" />
          <p className="font-semibold">Manager or admin access required</p>
          <p className="text-sm text-red-500 mt-1">Attendance record edits are restricted to authorized managers and admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="bg-gradient-to-r from-green-700 to-green-600 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Edit Records</h1>
              <p className="text-green-100 text-sm">Select an employee and update attendance records</p>
            </div>
          </div>
          <div className="hidden sm:block text-right text-green-100 text-xs">
            PowerMatix Portal
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-gray-900 font-semibold">Edit Records</h2>
              <p className="text-gray-400 text-xs">Select an employee to review and overwrite any attendance record.</p>
            </div>
            <label className="text-sm text-gray-600 md:min-w-[280px]">
              Employee
              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              >
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} - {employee.project ?? 'Unassigned'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedEmployee ? (
            <div>
              <div className="px-4 py-3 bg-green-50/70 border-b border-green-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-green-800 font-semibold">{selectedEmployee.name}</p>
                  <p className="text-green-700/70 text-xs">
                    {selectedEmployee.email} - Reporting {formatDisplayTime(selectedEmployee.reportingTime)}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(selectedEmployee)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  <Edit3 className="w-4 h-4" />
                  Add new record
                </button>
              </div>

              {selectedEmployeeRecords.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] tracking-wide">
                      <tr>
                        {['Date', 'Reporting Time', 'Check In', 'Check Out', 'Hours', 'Status', 'Remarks', 'Action'].map((label) => (
                          <th key={label} className={`px-4 py-3 font-bold whitespace-nowrap ${label === 'Action' ? 'text-right' : 'text-left'}`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedEmployeeRecords.map((record) => {
                        const meta = getStatusMeta(record.status);
                        const approvedLeave = getApprovedLeaveForDate(leaveRequests, selectedEmployee.id, record.date);
                        return (
                          <tr key={record.id} className={`${meta.row} hover:bg-green-50 transition-colors`}>
                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatDateLabel(record.date)}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-700">{formatDisplayTime(selectedEmployee.reportingTime)}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-700">{formatDisplayTime(record.checkIn)}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-700">{formatDisplayTime(record.checkOut)}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-700">{formatHours(record)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badge}`}>
                                {getStatusLabel(record.status, approvedLeave)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate">{record.notes ?? '-'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => openEdit(selectedEmployee, record)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="font-semibold text-gray-700">No attendance records found</p>
                  <p className="text-sm mt-1">Create a record for the selected date if this employee needs a manual entry.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">No employees are available for editing.</div>
          )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-green-600 text-white px-5 py-4">
              <h3 className="font-semibold">Edit Record</h3>
              <p className="text-sm text-green-100">{editing.user.name} - {editForm.date}</p>
            </div>
            <div className="p-5 space-y-4">
              <label className="text-sm text-gray-600 block">
                Attendance Date
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(event) => setEditForm((form) => ({ ...form, date: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-600">
                  Edit Check-in Time
                  <input type="time" value={editForm.checkIn} onChange={(event) => setEditForm((form) => ({ ...form, checkIn: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500" />
                </label>
                <label className="text-sm text-gray-600">
                  Edit Check-out Time
                  <input type="time" value={editForm.checkOut} onChange={(event) => setEditForm((form) => ({ ...form, checkOut: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500" />
                </label>
              </div>
              <label className="text-sm text-gray-600 block">
                Status
                <select value={editForm.status} onChange={(event) => setEditForm((form) => ({ ...form, status: event.target.value as AttendanceStatus }))} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500">
                  <option value="present">On Time</option>
                  <option value="late">Late</option>
                  <option value="checked-in-only">Checked In Only</option>
                  <option value="absent">Absent (Not approved Leave)</option>
                  <option value="on-leave">On Leave</option>
                  <option value="holiday">Holiday</option>
                  <option value="weekly-off">Weekly Off</option>
                </select>
              </label>
              <label className="text-sm text-gray-600 block">
                Remarks
                <textarea value={editForm.notes} onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))} rows={3} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500 resize-none" placeholder="Reason for admin edit" />
              </label>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                This change is tracked with edited by {currentUser.name} and the current timestamp.
              </p>
              {editError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {editError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(null)}
                  disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingEdit ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
