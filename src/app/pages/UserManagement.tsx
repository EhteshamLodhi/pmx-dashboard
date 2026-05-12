'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, Search, Edit3, Check, X, ChevronDown, Shield, UserCheck, UserX, PlusCircle, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { PolicySettings, User } from '../types';

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
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    lineManagerId: user.lineManagerId ?? '',
    projectManagerId: user.projectManagerId ?? '',
    directorId: user.directorId ?? '',
    role: user.role,
    isActive: user.isActive,
    reportingTime: user.reportingTime ?? '09:00',
    checkInGraceMinutes: user.checkInGraceMinutes ?? 15,
    checkOutReminderTime: user.checkOutReminderTime ?? '19:00',
    sickLeaveDays: user.sickLeaveDays ?? 10,
    casualLeaveDays: user.casualLeaveDays ?? 10,
    annualLeaveDays: user.annualLeaveDays ?? 14,
  });

  const managers = users.filter((item) => item.role === 'manager' || item.role === 'director' || item.role === 'admin');
  const directors = users.filter((item) => item.role === 'director' || item.role === 'admin');
  const roleBadge = getRoleBadge(user.role);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await onUpdate(user.id, form);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save user changes.');
    } finally {
      setIsSaving(false);
    }
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
              {user.position} - {user.department}
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
              ['Sick Leave Days', 'sickLeaveDays'],
              ['Casual Leave Days', 'casualLeaveDays'],
              ['Annual Leave Days', 'annualLeaveDays'],
            ].map(([label, key]) => (
              <label key={key} className="block text-gray-600" style={{ fontSize: '12px', fontWeight: 500 }}>
                {label}
                <input
                  type="number"
                  min={0}
                  value={form[key as 'sickLeaveDays' | 'casualLeaveDays' | 'annualLeaveDays']}
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
              <Check className="w-4 h-4" />
              Save Changes
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

function PolicySettingsPanel() {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PolicySettings>({
    checkInGraceMinutes: 15,
    checkOutReminderTime: '19:00',
    minimumLeaveNoticeHours: 48,
    sickLeaveDays: 10,
    casualLeaveDays: 10,
    annualLeaveDays: 14,
  });

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
    try {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save policy settings.');
    } finally {
      setIsSaving(false);
    }
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              Leave Notice Hours
              <input
                type="number"
                min={0}
                value={policy.minimumLeaveNoticeHours}
                onChange={(event) => setPolicy((value) => ({ ...value, minimumLeaveNoticeHours: Number(event.target.value) }))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
            {[
              ['Default Sick Leave Days', 'sickLeaveDays'],
              ['Default Casual Leave Days', 'casualLeaveDays'],
              ['Default Annual Leave Days', 'annualLeaveDays'],
            ].map(([label, key]) => (
              <label key={key} className="text-sm text-gray-600">
                {label}
                <input
                  type="number"
                  min={0}
                  value={policy[key as 'sickLeaveDays' | 'casualLeaveDays' | 'annualLeaveDays']}
                  onChange={(event) => setPolicy((value) => ({ ...value, [key]: Number(event.target.value) }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            ))}
          </div>
          <button
            onClick={() => void save()}
            disabled={isSaving}
            className="mt-4 w-full py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60"
          >
            Save Policy Settings
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
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'employee' as User['role'],
    department: '',
    project: '',
    position: '',
    reportingTime: '09:00',
    checkInGraceMinutes: 15,
    checkOutReminderTime: '19:00',
    sickLeaveDays: 10,
    casualLeaveDays: 10,
    annualLeaveDays: 14,
    lineManagerId: '',
    projectManagerId: '',
    directorId: '',
  });

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        !search ||
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.department.toLowerCase().includes(search.toLowerCase());
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && user.isActive) ||
        (filterStatus === 'inactive' && !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [filterRole, filterStatus, search, users]);

  const activeCount = users.filter((user) => user.isActive).length;
  const departmentCount = new Set(users.map((user) => user.department)).size;

  const handleUpdate = async (userId: string, updates: Partial<User>) => {
    await updateUser(userId, updates);
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.department) return;

    try {
      setError(null);
      await addUser(newUser);
      setShowAddUser(false);
      setNewUser({
        name: '',
        email: '',
        role: 'employee',
        department: '',
        project: '',
        position: '',
        reportingTime: '09:00',
        checkInGraceMinutes: 15,
        checkOutReminderTime: '19:00',
        sickLeaveDays: 10,
        casualLeaveDays: 10,
        annualLeaveDays: 14,
        lineManagerId: '',
        projectManagerId: '',
        directorId: '',
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create user.');
    }
  };

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
                ['Department', 'department', 'text'],
                ['Project', 'project', 'text'],
                ['Position', 'position', 'text'],
                ['Reporting Time', 'reportingTime', 'time'],
                ['Check-in Cutoff Minutes', 'checkInGraceMinutes', 'number'],
                ['Check-out Reminder', 'checkOutReminderTime', 'time'],
                ['Sick Leave Days', 'sickLeaveDays', 'number'],
                ['Casual Leave Days', 'casualLeaveDays', 'number'],
                ['Annual Leave Days', 'annualLeaveDays', 'number'],
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
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateUser()}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 font-semibold"
              >
                Create User
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
          { label: 'Departments', value: departmentCount, color: 'text-blue-600', bg: 'bg-blue-50' },
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
            placeholder="Search by name, email, department..."
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
