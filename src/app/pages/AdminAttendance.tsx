'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Edit3, Loader2, Search, Shield, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AttendanceRecord, AttendanceStatus, User } from '../types';
import { formatDisplayTime } from '@/lib/time';
import { useActionRunner } from '@/app/hooks/useActionRunner';

const TODAY = new Date().toISOString().split('T')[0];

function getStatusMeta(status: AttendanceStatus | 'absent') {
  switch (status) {
    case 'present': return { label: 'Present', badge: 'bg-green-100 text-green-700', row: 'bg-green-50/65' };
    case 'late': return { label: 'Late', badge: 'bg-orange-100 text-orange-700', row: 'bg-orange-50/75' };
    case 'checked-in-only': return { label: 'Checked In Only', badge: 'bg-yellow-100 text-yellow-700', row: 'bg-yellow-50/60' };
    case 'on-leave': return { label: 'On Leave', badge: 'bg-blue-100 text-blue-700', row: 'bg-blue-50/60' };
    default: return { label: 'Absent', badge: 'bg-red-100 text-red-700', row: 'bg-red-50/75' };
  }
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
  const { users, attendanceRecords, updateAttendanceRecord, addAttendanceRecord, currentUser } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [project, setProject] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [editing, setEditing] = useState<{ user: User; record?: AttendanceRecord } | null>(null);
  const [editForm, setEditForm] = useState({
    checkIn: '',
    checkOut: '',
    status: 'present' as AttendanceStatus,
    notes: '',
  });
  const [editError, setEditError] = useState<string | null>(null);

  const activeEmployees = users.filter((user) => user.isActive && user.role !== 'admin');
  const projects = Array.from(new Set(activeEmployees.map((user) => user.project ?? 'Unassigned')));

  const rows = useMemo(() => {
    return activeEmployees
      .filter((user) => project === 'all' || (user.project ?? 'Unassigned') === project)
      .filter((user) => !deferredSearch || `${user.name} ${user.email} ${user.project ?? ''}`.toLowerCase().includes(deferredSearch.toLowerCase()))
      .map((user) => ({
        user,
        record: attendanceRecords.find((record) => record.userId === user.id && record.date === selectedDate),
      }));
  }, [activeEmployees, attendanceRecords, deferredSearch, project, selectedDate]);

  const summary = {
    total: rows.length,
    present: rows.filter(({ record }) => record?.status === 'present' || record?.status === 'checked-in-only').length,
    absent: rows.filter(({ record }) => !record || record.status === 'absent').length,
    late: rows.filter(({ record }) => record?.status === 'late').length,
    leave: rows.filter(({ record }) => record?.status === 'on-leave').length,
  };

  const openEdit = (user: User, record?: AttendanceRecord) => {
    setEditing({ user, record });
    setEditForm({
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
      date: selectedDate,
      checkIn: editForm.checkIn || undefined,
      checkOut: editForm.checkOut || undefined,
      status: editForm.status,
      notes: editForm.notes || undefined,
    };

    await runAction(`admin-attendance:${editing.user.id}:${selectedDate}`, async () => {
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
  const savingEdit = editing ? isPending(`admin-attendance:${editing.user.id}:${selectedDate}`) : false;

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-red-700">
          <Shield className="w-6 h-6 mb-2" />
          <p className="font-semibold">Admin access required</p>
          <p className="text-sm text-red-500 mt-1">Employees cannot edit attendance entries.</p>
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
              <h1 className="text-white text-xl font-bold">Admin Attendance Dashboard</h1>
              <p className="text-green-100 text-sm">Daily report view for WhatsApp and Teams sharing</p>
            </div>
          </div>
          <div className="hidden sm:block text-right text-green-100 text-xs">
            PowerMatix Attendance Tracking Portal
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm text-gray-600">
            Date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
            />
          </label>
          <label className="text-sm text-gray-600">
            Project
            <select value={project} onChange={(event) => setProject(event.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500">
              <option value="all">All projects</option>
              {projects.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-600">
            Search
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Employee name"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Employees', value: summary.total, icon: Users, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Present Today', value: summary.present, icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Absent Today', value: summary.absent, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Late Employees', value: summary.late, icon: Clock, color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: 'On Leave', value: summary.leave, icon: Calendar, color: 'text-blue-700', bg: 'bg-blue-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className={`${card.color} text-2xl font-bold`}>{card.value}</p>
            <p className="text-gray-500 text-xs">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-gray-900 font-semibold">Attendance Report</h2>
            <p className="text-gray-400 text-xs">{selectedDate} - {rows.length} employees</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">Screenshot-ready</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Employee Name</th>
                <th className="text-left px-4 py-3 font-bold">Project</th>
                <th className="text-left px-4 py-3 font-bold">Reporting Time</th>
                <th className="text-left px-4 py-3 font-bold">Closing Time</th>
                <th className="text-left px-4 py-3 font-bold">Hours</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-right px-4 py-3 font-bold">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(({ user, record }) => {
                const status = record?.status ?? 'absent';
                const meta = getStatusMeta(status);
                return (
                  <tr key={user.id} className={`${meta.row} hover:bg-green-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{user.project ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{formatDisplayTime(record?.checkIn)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{formatDisplayTime(record?.checkOut)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{formatHours(record)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(user, record)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50">
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-green-600 text-white px-5 py-4">
              <h3 className="font-semibold">Edit Attendance Entry</h3>
              <p className="text-sm text-green-100">{editing.user.name} - {selectedDate}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
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
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="checked-in-only">Checked In Only</option>
                  <option value="absent">Absent</option>
                  <option value="on-leave">On Leave</option>
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
