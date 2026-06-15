'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Users, Search, Edit3, Check, X, ChevronDown, Shield, UserCheck, UserX, PlusCircle, SlidersHorizontal, Loader2, CalendarPlus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Holiday, HolidayType, PolicySettings, User } from '../types';
import { useActionRunner } from '@/app/hooks/useActionRunner';
import { WEEK_DAYS, weekdayLabel } from '@/lib/attendance-calendar';
import { mapHoliday } from '@/lib/supabase/mappers';
import { defaultPolicySettings } from '@/lib/powermatix-policy';

function getRoleBadge(role: User['role']) {
  switch (role) {
    case 'admin':
      return { label: 'Admin', cls: 'bg-red-50 text-red-600' };
    case 'director':
      return { label: 'Director', cls: 'bg-purple-50 text-purple-600' };
    case 'manager':
      return { label: 'Manager', cls: 'bg-blue-50 text-blue-600' };
    default:
      return { label: 'Employee', cls: 'bg-gray-50 text-gray-600' };
  }
}

function UserRow({
  user,
  users,
  onUpdate,
}: {
  user: User;
  users: User[];
  onUpdate: (id: string, updates: Partial<User>) => Promise<void>;
}) {
  const { runAction } = useActionRunner();
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    lineManagerId: user.lineManagerId ?? '',
    projectManagerId: user.projectManagerId ?? '',
    directorId: user.directorId ?? '',
    role: user.role,
    isActive: user.isActive,
    reportingTime: user.reportingTime ?? '11:00',
    checkInGraceMinutes: user.checkInGraceMinutes ?? 0,
    checkOutReminderTime: user.checkOutReminderTime ?? '20:00',
    sickLeaveDays: user.sickLeaveDays ?? 0,
    minorSickLeaveDays: user.minorSickLeaveDays ?? 12,
    emergencyLeaveDays: user.emergencyLeaveDays ?? 3,
    casualLeaveDays: user.casualLeaveDays ?? 12,
    annualLeaveDays: user.annualLeaveDays ?? 10,
    paternityLeaveDays: user.paternityLeaveDays ?? 3,
    marriageLeaveDays: user.marriageLeaveDays ?? 3,
    hajjLeaveDays: user.hajjLeaveDays ?? 40,
    umrahLeaveDays: user.umrahLeaveDays ?? 0,
  });

  const managers = users.filter((item) => item.role === 'manager' || item.role === 'director' || item.role === 'admin');
  const directors = users.filter((item) => item.role === 'director' || item.role === 'admin');
  const roleBadge = getRoleBadge(user.role);

  const handleSave = async () => {
    await runAction(`user-save:${user.id}`, async () => {
      setIsSaving(true);
      setError(null);
      await onUpdate(user.id, form);
      setEditing(false);
    }, {
      loading: 'Saving user settings...',
      success: 'User settings saved.',
      error: 'Unable to save user changes.',
    }).catch((saveError) => {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save user changes.');
    }).finally(() => {
      setIsSaving(false);
    });
  };

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${editing ? 'border-green-200 shadow-md' : 'border-gray-100'}`}>
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${user.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
            <span className={user.isActive ? 'text-green-700' : 'text-gray-500'} style={{ fontSize: '13px', fontWeight: 600 }}>
              {user.name
                .split(' ')
                .map((part) => part[0])
                .join('')}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 600 }}>
                {user.name}
              </p>
              <span className={`px-2 py-0.5 rounded-full ${roleBadge.cls}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                {roleBadge.label}
              </span>
              {!user.isActive && (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500" style={{ fontSize: '11px', fontWeight: 600 }}>
                  Inactive
                </span>
              )}
            </div>
            <p className="text-gray-400" style={{ fontSize: '12px' }}>
              {user.email}
            </p>
            <p className="text-gray-400" style={{ fontSize: '12px' }}>
              {user.position} - {user.project ?? 'Unassigned'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing((value) => !value)}
          className={`p-2 rounded-lg transition-all flex-shrink-0 ${editing ? 'bg-gray-100 text-gray-500' : 'hover:bg-green-50 text-green-600'}`}
        >
          {editing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
        </button>
      </div>

      {!editing && (
        <div className="px-4 pb-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Line Manager', id: user.lineManagerId },
            { label: 'Project Manager', id: user.projectManagerId },
            { label: 'Director', id: user.directorId },
          ].map((item) => {
            const person = users.find((candidate) => candidate.id === item.id);

            return (
              <div key={item.label} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-gray-400" style={{ fontSize: '10px' }}>
                  {item.label}
                </p>
                <p className="text-gray-700 mt-0.5" style={{ fontSize: '12px', fontWeight: 500 }}>
                  {person?.name.split(' ')[0] ?? '--'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
          <p className="text-green-700" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Edit Hierarchy & Settings
          </p>

          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: '12px', fontWeight: 500 }}>
              Role
            </label>
            <div className="relative">
              <select
                value={form.role}
                onChange={(event) => setForm((value) => ({ ...value, role: event.target.value as User['role'] }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 appearance-none"
                style={{ fontSize: '13px' }}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="director">Director</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block text-gray-600" style={{ fontSize: '12px', fontWeight: 500 }}>
              Reporting Time
              <input
                type="time"
                value={form.reportingTime}
                onChange={(event) => setForm((value) => ({ ...value, reportingTime: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontSize: '13px' }}
              />
            </label>
            <label className="block text-gray-600" style={{ fontSize: '12px', fontWeight: 500 }}>
              Check-in Cutoff Minutes
              <input
                type="number"
                min={0}
                value={form.checkInGraceMinutes}
                onChange={(event) => setForm((value) => ({ ...value, checkInGraceMinutes: Number(event.target.value) }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontSize: '13px' }}
              />
            </label>
            <label className="block text-gray-600" style={{ fontSize: '12px', fontWeight: 500 }}>
              Check-out Reminder
              <input
                type="time"
                value={form.checkOutReminderTime}
                onChange={(event) => setForm((value) => ({ ...value, checkOutReminderTime: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontSize: '13px' }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              ['Minor Sick Leave Days', 'minorSickLeaveDays'],
              ['Emergency Leave Days', 'emergencyLeaveDays'],
              ['Casual + Sick Pool', 'casualLeaveDays'],
              ['Annual Leave Days', 'annualLeaveDays'],
              ['Paternity Leave Days', 'paternityLeaveDays'],
              ['Marriage Leave Days', 'marriageLeaveDays'],
              ['Hajj Calendar Days', 'hajjLeaveDays'],
              ['Umrah Days', 'umrahLeaveDays'],
            ].map(([label, key]) => (
              <label key={key} className="block text-gray-600" style={{ fontSize: '12px', fontWeight: 500 }}>
                {label}
                <input
                  type="number"
                  min={0}
                  value={form[key as 'minorSickLeaveDays' | 'emergencyLeaveDays' | 'casualLeaveDays' | 'annualLeaveDays' | 'paternityLeaveDays' | 'marriageLeaveDays' | 'hajjLeaveDays' | 'umrahLeaveDays']}
                  onChange={(event) => setForm((value) => ({ ...value, [key]: Number(event.target.value) }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                  style={{ fontSize: '13px' }}
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: '12px', fontWeight: 500 }}>
                Line Manager
              </label>
              <div className="relative">
                <select
                  value={form.lineManagerId}
                  onChange={(event) => setForm((value) => ({ ...value, lineManagerId: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 appearance-none"
                  style={{ fontSize: '13px' }}
                >
                  <option value="">None</option>
                  {managers
                    .filter((manager) => manager.id !== user.id)
                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: '12px', fontWeight: 500 }}>
                Project Manager
              </label>
              <div className="relative">
                <select
                  value={form.projectManagerId}
                  onChange={(event) => setForm((value) => ({ ...value, projectManagerId: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 appearance-none"
                  style={{ fontSize: '13px' }}
                >
                  <option value="">None</option>
                  {managers
                    .filter((manager) => manager.id !== user.id)
                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: '12px', fontWeight: 500 }}>
                Director
              </label>
              <div className="relative">
                <select
                  value={form.directorId}
                  onChange={(event) => setForm((value) => ({ ...value, directorId: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 appearance-none"
                  style={{ fontSize: '13px' }}
                >
                  <option value="">None</option>
                  {directors
                    .filter((director) => director.id !== user.id)
                    .map((director) => (
                      <option key={director.id} value={director.id}>
                        {director.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: 500 }}>
              Account Status
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setForm((value) => ({ ...value, isActive: true }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${form.isActive ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
                style={{ fontSize: '12px', fontWeight: 500 }}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Active
              </button>
              <button
                onClick={() => setForm((value) => ({ ...value, isActive: false }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${!form.isActive ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
                style={{ fontSize: '12px', fontWeight: 500 }}
              >
                <UserX className="w-3.5 h-3.5" />
                Inactive
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-all"
              style={{ fontSize: '13px', fontWeight: 500 }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all disabled:opacity-60"
              style={{ fontSize: '13px', fontWeight: 600 }}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getHolidayTypeLabel(type: HolidayType) {
  if (type === 'company') return 'Company Holiday';
  if (type === 'optional') return 'Optional Holiday';
  return 'Public Holiday';
}

function HolidayManagementPanel() {
  const { holidays, refreshData } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localHolidays, setLocalHolidays] = useState<Holiday[]>(holidays);
  const [form, setForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    type: 'public' as HolidayType,
    recurring: false,
    description: '',
  });

  useEffect(() => {
    setLocalHolidays(holidays);
  }, [holidays]);

  const resetForm = () => {
    setEditing(null);
    setForm({ name: '', startDate: '', endDate: '', type: 'public', recurring: false, description: '' });
  };

  const beginEdit = (holiday: Holiday) => {
    setEditing(holiday);
    setForm({
      name: holiday.name,
      startDate: holiday.startDate,
      endDate: holiday.endDate,
      type: holiday.type,
      recurring: holiday.recurring,
      description: holiday.description ?? '',
    });
  };

  const saveHoliday = async () => {
    await runAction(`holiday-save:${editing?.id ?? 'new'}`, async () => {
      setMessage(null);
      const response = await fetch('/api/admin/holidays', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editing?.id,
          ...form,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to save holiday.');
      }

      const body = (await response.json()) as { data?: Parameters<typeof mapHoliday>[0] };
      if (body.data) {
        const savedHoliday = mapHoliday(body.data);
        setLocalHolidays((items) =>
          editing
            ? items.map((item) => (item.id === savedHoliday.id ? savedHoliday : item))
            : [...items, savedHoliday].sort((a, b) => a.startDate.localeCompare(b.startDate)),
        );
      }

      resetForm();
      setMessage('Holiday saved.');
      void refreshData();
    }, {
      loading: 'Saving holiday...',
      success: 'Holiday saved.',
      error: 'Unable to save holiday.',
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Unable to save holiday.');
    });
  };

  const deleteHoliday = async (holiday: Holiday) => {
    const confirmed = window.confirm('Are you sure you want to delete this holiday?');
    if (!confirmed) return;

    const previous = localHolidays;
    await runAction(`holiday-delete:${holiday.id}`, async () => {
      setMessage(null);
      setLocalHolidays((items) => items.filter((item) => item.id !== holiday.id));

      const response = await fetch(`/api/admin/holidays?id=${encodeURIComponent(holiday.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setLocalHolidays(previous);
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to delete holiday.');
      }

      setMessage('Holiday deleted.');
      void refreshData();
    }, {
      loading: 'Deleting holiday...',
      success: 'Holiday deleted.',
      error: 'Unable to delete holiday.',
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Unable to delete holiday.');
    });
  };

  const savingHoliday = isPending(`holiday-save:${editing?.id ?? 'new'}`);

  return (
    <div className="my-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-green-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-green-700 font-semibold text-sm">
          <CalendarPlus className="w-4 h-4" />
          Holiday Management
        </span>
        <ChevronDown className={`w-4 h-4 text-green-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-600">
              Holiday Name
              <input
                value={form.name}
                onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            <label className="text-sm text-gray-600">
              Holiday Type
              <select
                value={form.type}
                onChange={(event) => setForm((value) => ({ ...value, type: event.target.value as HolidayType }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="public">Public Holiday</option>
                <option value="company">Company Holiday</option>
                <option value="optional">Optional Holiday</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-600">
              Start Date
              <input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    startDate: event.target.value,
                    endDate: value.endDate && value.endDate < event.target.value ? event.target.value : value.endDate,
                  }))
                }
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            <label className="text-sm text-gray-600">
              End Date
              <input
                type="date"
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(event) => setForm((value) => ({ ...value, endDate: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-600">
              Description
              <input
                value={form.description}
                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
            <span className="text-sm text-gray-700">Repeat every year</span>
            <button
              type="button"
              onClick={() => setForm((value) => ({ ...value, recurring: !value.recurring }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${form.recurring ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
            >
              {form.recurring ? 'Recurring' : 'One Time'}
            </button>
          </div>

          <div className="mt-4 flex gap-3">
            {editing && (
              <button
                onClick={resetForm}
                disabled={savingHoliday}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel Edit
              </button>
            )}
            <button
              onClick={() => void saveHoliday()}
              disabled={savingHoliday || !form.name.trim() || !form.startDate || !form.endDate}
              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingHoliday ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : editing ? 'Update Holiday' : 'Add Holiday'}
            </button>
          </div>

          {message && (
            <div className="mt-3 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
              {message}
            </div>
          )}

          <div className="mt-5 space-y-2">
            {localHolidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-gray-900 font-semibold text-sm">{holiday.name}</p>
                  <p className="text-gray-500 text-xs">
                    {holiday.startDate === holiday.endDate ? holiday.startDate : `${holiday.startDate} to ${holiday.endDate}`} - {getHolidayTypeLabel(holiday.type)}{holiday.recurring ? ' - recurring' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => beginEdit(holiday)} className="p-2 rounded-lg text-green-600 hover:bg-green-50">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void deleteHoliday(holiday)}
                    disabled={isPending(`holiday-delete:${holiday.id}`)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-60"
                  >
                    {isPending(`holiday-delete:${holiday.id}`) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            {localHolidays.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">
                No holidays configured yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PolicySettingsPanel() {
  const { runAction } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PolicySettings>(defaultPolicySettings());

  useEffect(() => {
    if (!open) return;

    fetch('/api/admin/policies', { credentials: 'include' })
      .then((response) => response.json())
      .then((body) => {
        if (body?.data) setPolicy(body.data);
      })
      .catch(() => setMessage('Unable to load policy settings.'));
  }, [open]);

  const save = async () => {
    await runAction('admin-policy-save', async () => {
      setIsSaving(true);
      setMessage(null);
      const response = await fetch('/api/admin/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to save policy settings.');
      }

      setMessage('Policy settings saved.');
    }, {
      loading: 'Saving policy settings...',
      success: 'Policy settings saved.',
      error: 'Unable to save policy settings.',
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Unable to save policy settings.');
    }).finally(() => {
      setIsSaving(false);
    });
  };

  return (
    <div className="my-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-green-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-green-700 font-semibold text-sm">
          <SlidersHorizontal className="w-4 h-4" />
          Attendance & Leave Policies
        </span>
        <ChevronDown className={`w-4 h-4 text-green-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          <div className="mb-4 rounded-2xl border border-green-100 bg-green-50/60 p-4">
            <div className="mb-3">
              <p className="text-green-800 font-semibold text-sm">Global Reporting Policy</p>
              <p className="text-green-600 text-xs mt-1">
                Used only when an employee-specific reporting time is missing.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm text-gray-600">
                Global Reporting Start Time
                <input
                  type="time"
                  value={policy.globalReportingTime}
                  onChange={(event) => setPolicy((value) => ({ ...value, globalReportingTime: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-green-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
              <label className="text-sm text-gray-600">
                Global Grace Period (Minutes)
                <input
                  type="number"
                  min={0}
                  value={policy.globalGracePeriod}
                  onChange={(event) => setPolicy((value) => ({ ...value, globalGracePeriod: Number(event.target.value) }))}
                  className="mt-1 w-full px-3 py-2 border border-green-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3">
              <p className="text-blue-800 font-semibold text-sm">Work Week Settings</p>
              <p className="text-blue-600 text-xs mt-1">
                Attendance reminders and absence calculations skip configured weekly off days.
              </p>
            </div>
            <label className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] sm:items-center gap-1 sm:gap-3 text-sm text-gray-600 mb-4 max-w-md">
              <span className="font-medium">Effective From</span>
              <input
                type="date"
                value={policy.workWeekEffectiveFrom}
                onChange={(event) => setPolicy((value) => ({ ...value, workWeekEffectiveFrom: event.target.value }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {WEEK_DAYS.map((day) => {
                const isOff = policy.weeklyOffDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setPolicy((value) => {
                        const nextOff = isOff
                          ? value.weeklyOffDays.filter((item) => item !== day)
                          : [...value.weeklyOffDays, day];
                        return {
                          ...value,
                          weeklyOffDays: nextOff,
                          workingDays: WEEK_DAYS.filter((item) => !nextOff.includes(item)),
                        };
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      isOff
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-green-200 bg-white text-green-700'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{weekdayLabel(day)}</span>
                    <span className="text-xs">{isOff ? 'Weekly Off' : 'Working Day'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm text-gray-600">
              Default Reporting Time
              <input
                type="time"
                value={policy.defaultReportingTime}
                onChange={(event) => setPolicy((value) => ({ ...value, defaultReportingTime: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            <label className="text-sm text-gray-600">
              Default Check-in Cutoff Minutes
              <input
                type="number"
                min={0}
                value={policy.checkInGraceMinutes}
                onChange={(event) => setPolicy((value) => ({ ...value, checkInGraceMinutes: Number(event.target.value) }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            <label className="text-sm text-gray-600">
              Default Check-out Reminder
              <input
                type="time"
                value={policy.checkOutReminderTime}
                onChange={(event) => setPolicy((value) => ({ ...value, checkOutReminderTime: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            <label className="text-sm text-gray-600">
              Casual Leave Notice Hours
              <input
                type="number"
                min={0}
                value={policy.casualLeaveNoticeHours}
                onChange={(event) => setPolicy((value) => ({ ...value, casualLeaveNoticeHours: Number(event.target.value) }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            {[ 
              ['Default Casual + Sick Pool', 'casualLeaveDays'],
              ['Default Minor Sick Reference', 'minorSickLeaveDays'],
              ['Default Emergency Leave Days', 'emergencyLeaveDays'],
              ['Default Annual Leave Days', 'annualLeaveDays'],
              ['Default Paternity Leave Days', 'paternityLeaveDays'],
              ['Default Marriage Leave Days', 'marriageLeaveDays'],
              ['Default Hajj Calendar Days', 'hajjLeaveDays'],
              ['Default Umrah Days', 'umrahLeaveDays'],
              ['Casual/Sick Monthly Cap', 'casualSickMonthlyCapDays'],
              ['Late Arrivals per CL Deduction', 'lateConversionCount'],
              ['Annual Eligibility Months', 'annualLeaveEligibilityMonths'],
            ].map(([label, key]) => (
              <label key={key} className="text-sm text-gray-600">
                {label}
                <input
                  type="number"
                  min={0}
                  value={policy[key as 'casualLeaveDays' | 'minorSickLeaveDays' | 'emergencyLeaveDays' | 'annualLeaveDays' | 'paternityLeaveDays' | 'marriageLeaveDays' | 'hajjLeaveDays' | 'umrahLeaveDays' | 'casualSickMonthlyCapDays' | 'lateConversionCount' | 'annualLeaveEligibilityMonths']}
                  onChange={(event) => setPolicy((value) => ({ ...value, [key]: Number(event.target.value) }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            ))}
            <label className="text-sm text-gray-600">
              Annual Notice Working Days
              <input
                type="number"
                min={0}
                value={policy.annualLeaveNoticeWorkingDays}
                onChange={(event) => setPolicy((value) => ({ ...value, annualLeaveNoticeWorkingDays: Number(event.target.value) }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm text-gray-600">
            Leave Policy Notes
            <textarea
              rows={5}
              value={policy.leavePolicyNotes}
              onChange={(event) => setPolicy((value) => ({ ...value, leavePolicyNotes: event.target.value }))}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </label>
          <button
            onClick={() => void save()}
            disabled={isSaving}
            className="mt-4 w-full py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60"
          >
            {isSaving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : 'Save Policy Settings'}
          </button>
          {message && (
            <div className="mt-3 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserManagement() {
  const { users, updateUser, addUser } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'employee' as User['role'],
    project: '',
    position: '',
    reportingTime: '11:00',
    checkInGraceMinutes: 0,
    checkOutReminderTime: '20:00',
    sickLeaveDays: 0,
    minorSickLeaveDays: 12,
    emergencyLeaveDays: 3,
    casualLeaveDays: 12,
    annualLeaveDays: 10,
    paternityLeaveDays: 3,
    marriageLeaveDays: 3,
    hajjLeaveDays: 40,
    umrahLeaveDays: 0,
    lineManagerId: '',
    projectManagerId: '',
    directorId: '',
  });

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        !deferredSearch ||
        user.name.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        user.email.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        (user.project ?? '').toLowerCase().includes(deferredSearch.toLowerCase());
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && user.isActive) ||
        (filterStatus === 'inactive' && !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [deferredSearch, filterRole, filterStatus, users]);

  const activeCount = users.filter((user) => user.isActive).length;
  const projectCount = new Set(users.map((user) => user.project ?? 'Unassigned')).size;

  const handleUpdate = async (userId: string, updates: Partial<User>) => {
    await updateUser(userId, updates);
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.project) return;

    await runAction('user-create', async () => {
      setError(null);
      await addUser(newUser);
      setShowAddUser(false);
      setNewUser({
        name: '',
        email: '',
        role: 'employee',
        project: '',
        position: '',
        reportingTime: '11:00',
        checkInGraceMinutes: 0,
        checkOutReminderTime: '20:00',
        sickLeaveDays: 0,
        minorSickLeaveDays: 12,
        emergencyLeaveDays: 3,
        casualLeaveDays: 12,
        annualLeaveDays: 10,
        paternityLeaveDays: 3,
        marriageLeaveDays: 3,
        hajjLeaveDays: 40,
        umrahLeaveDays: 0,
        lineManagerId: '',
        projectManagerId: '',
        directorId: '',
      });
    }, {
      loading: 'Creating user...',
      success: 'User created.',
      error: 'Unable to create user.',
    }).catch((createError) => {
      setError(createError instanceof Error ? createError.message : 'Unable to create user.');
    });
  };
  const creatingUser = isPending('user-create');

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>
            User Management
          </h1>
          <p className="text-gray-500" style={{ fontSize: '13px' }}>
            Admin - Manage users, roles, and hierarchy
          </p>
        </div>
      </div>

      <PolicySettingsPanel />
      <HolidayManagementPanel />

      <div className="my-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAddUser((value) => !value)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-green-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <PlusCircle className="w-4 h-4" />
            Add New User
          </span>
          <ChevronDown className={`w-4 h-4 text-green-600 transition-transform ${showAddUser ? 'rotate-180' : ''}`} />
        </button>
        {showAddUser && (
          <div className="px-5 pb-5 pt-1 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['Full Name', 'name', 'text'],
                ['Email', 'email', 'email'],
                ['Project', 'project', 'text'],
                ['Position', 'position', 'text'],
                ['Reporting Time', 'reportingTime', 'time'],
                ['Check-in Cutoff Minutes', 'checkInGraceMinutes', 'number'],
                ['Check-out Reminder', 'checkOutReminderTime', 'time'],
                ['Minor Sick Leave Days', 'minorSickLeaveDays', 'number'],
                ['Emergency Leave Days', 'emergencyLeaveDays', 'number'],
                ['Casual + Sick Pool', 'casualLeaveDays', 'number'],
                ['Annual Leave Days', 'annualLeaveDays', 'number'],
                ['Paternity Leave Days', 'paternityLeaveDays', 'number'],
                ['Marriage Leave Days', 'marriageLeaveDays', 'number'],
                ['Hajj Calendar Days', 'hajjLeaveDays', 'number'],
                ['Umrah Days', 'umrahLeaveDays', 'number'],
              ].map(([label, key, type]) => (
                <label key={key} className="text-sm text-gray-600">
                  {label}
                  <input
                    type={type}
                    min={type === 'number' ? 0 : undefined}
                    value={(newUser as Record<string, string | number>)[key]}
                    onChange={(event) =>
                      setNewUser((value) => ({
                        ...value,
                        [key]: type === 'number' ? Number(event.target.value) : event.target.value,
                      }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>
              ))}
              <label className="text-sm text-gray-600">
                Role
                <select
                  value={newUser.role}
                  onChange={(event) => setNewUser((value) => ({ ...value, role: event.target.value as User['role'] }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="director">Director</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="text-sm text-gray-600">
                Line Manager
                <select
                  value={newUser.lineManagerId}
                  onChange={(event) => setNewUser((value) => ({ ...value, lineManagerId: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Not assigned</option>
                  {users
                    .filter((user) => ['manager', 'director', 'admin'].includes(user.role))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm text-gray-600">
                Project Manager
                <select
                  value={newUser.projectManagerId}
                  onChange={(event) => setNewUser((value) => ({ ...value, projectManagerId: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Not assigned</option>
                  {users
                    .filter((user) => ['manager', 'director', 'admin'].includes(user.role))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm text-gray-600">
                Director
                <select
                  value={newUser.directorId}
                  onChange={(event) => setNewUser((value) => ({ ...value, directorId: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Not assigned</option>
                  {users
                    .filter((user) => ['director', 'admin'].includes(user.role))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowAddUser(false)}
                disabled={creatingUser}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateUser()}
                disabled={creatingUser}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creatingUser ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </span>
                ) : 'Create User'}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
        {[
          { label: 'Total Users', value: users.length, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Active', value: activeCount, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Projects', value: projectCount, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Admins', value: users.filter((user) => user.role === 'admin').length, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4`}>
            <p className={stat.color} style={{ fontSize: '22px', fontWeight: 700 }}>
              {stat.value}
            </p>
            <p className="text-gray-500" style={{ fontSize: '12px' }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, project..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontSize: '14px' }}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={filterRole}
              onChange={(event) => setFilterRole(event.target.value)}
              className="pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-green-500 appearance-none"
              style={{ fontSize: '13px' }}
            >
              <option value="all">All Roles</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="director">Director</option>
              <option value="admin">Admin</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-green-500 appearance-none"
              style={{ fontSize: '13px' }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <p className="text-gray-400 mb-3" style={{ fontSize: '13px' }}>
        Showing {filteredUsers.length} of {users.length} users
      </p>

      <div className="space-y-3">
        {filteredUsers.map((user) => (
          <UserRow key={user.id} user={user} users={users} onUpdate={handleUpdate} />
        ))}
        {filteredUsers.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400" style={{ fontSize: '14px' }}>
              No users match your search criteria
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
