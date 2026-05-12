'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Phone,
  Building,
  Calendar,
  Shield,
  LogOut,
  ChevronRight,
  Edit3,
  Check,
  Users,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

function getRoleLabel(role: string) {
  switch (role) {
    case 'admin':
      return 'System Administrator';
    case 'director':
      return 'Director';
    case 'manager':
      return 'Line Manager';
    default:
      return 'Employee';
  }
}

export default function Profile() {
  const { currentUser, users, logout, updateUser, getAttendanceForUser, leaveRequests } = useApp();
  const router = useRouter();
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  useEffect(() => {
    setPhone(currentUser?.phone ?? '');
  }, [currentUser?.phone]);

  if (!currentUser) return null;

  const lineManager = users.find((user) => user.id === currentUser.lineManagerId);
  const projectManager = users.find((user) => user.id === currentUser.projectManagerId);
  const director = users.find((user) => user.id === currentUser.directorId);

  const myAttendance = getAttendanceForUser(currentUser.id);
  const presentDays = myAttendance.filter((record) => record.status === 'present' || record.status === 'late').length;
  const myLeaves = leaveRequests.filter((request) => request.userId === currentUser.id && request.status === 'approved').length;

  const handleLogout = () => {
    void logout().then(() => router.push('/'));
  };

  const handleSavePhone = async () => {
    try {
      setIsSavingPhone(true);
      setSaveError(null);
      await updateUser(currentUser.id, { phone });
      setEditingPhone(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your phone number.');
    } finally {
      setIsSavingPhone(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-gray-900 mb-6" style={{ fontSize: '22px', fontWeight: 700 }}>
        Profile & Settings
      </h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="bg-gradient-to-r from-green-600 to-green-500 p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-white" style={{ fontSize: '22px', fontWeight: 700 }}>
                {currentUser.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              </span>
            </div>
            <div>
              <h2 className="text-white" style={{ fontSize: '20px', fontWeight: 700 }}>
                {currentUser.name}
              </h2>
              <p className="text-green-100 mt-0.5" style={{ fontSize: '14px' }}>
                {currentUser.position}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white" style={{ fontSize: '11px', fontWeight: 600 }}>
                  {getRoleLabel(currentUser.role)}
                </span>
                <span className="text-green-200" style={{ fontSize: '12px' }}>
                  {currentUser.department}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'Days Present', value: presentDays },
            { label: 'Leaves Taken', value: myLeaves },
            { label: 'Since', value: new Date(currentUser.joinDate).getFullYear().toString() },
          ].map((stat) => (
            <div key={stat.label} className="p-4 text-center">
              <p className="text-gray-900" style={{ fontSize: '18px', fontWeight: 700 }}>
                {stat.value}
              </p>
              <p className="text-gray-400" style={{ fontSize: '11px' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="divide-y divide-gray-50">
          {[
            { icon: Mail, label: 'Email', value: currentUser.email },
            { icon: Building, label: 'Department', value: currentUser.department },
            {
              icon: Calendar,
              label: 'Joined',
              value: new Date(currentUser.joinDate).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }),
            },
          ].map((item) => (
            <div key={item.label} className="px-5 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-gray-400" style={{ fontSize: '11px' }}>
                  {item.label}
                </p>
                <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 500 }}>
                  {item.value}
                </p>
              </div>
            </div>
          ))}

          <div className="px-5 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-gray-400" style={{ fontSize: '11px' }}>
                Phone
              </p>
              {editingPhone ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="flex-1 px-2 py-1 border border-green-300 rounded-lg bg-green-50 text-gray-900 outline-none"
                    style={{ fontSize: '14px' }}
                    autoFocus
                  />
                  <button
                    onClick={() => void handleSavePhone()}
                    disabled={isSavingPhone}
                    className="p-1.5 bg-green-600 text-white rounded-lg disabled:opacity-60"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: 500 }}>
                    {phone || '--'}
                  </p>
                  <button onClick={() => setEditingPhone(true)} className="text-green-600 p-1">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {saveError && (
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>
            Reporting Hierarchy
          </h2>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Line Manager', person: lineManager },
            { label: 'Project Manager', person: projectManager },
            { label: 'Director', person: director },
          ].map((item) => (
            <div key={item.label} className="px-5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-gray-400" style={{ fontSize: '12px' }}>
                  {item.label}
                </p>
                <p className="text-gray-900 mt-0.5" style={{ fontSize: '14px', fontWeight: 500 }}>
                  {item.person?.name ?? 'Not assigned'}
                </p>
                {item.person && (
                  <p className="text-gray-400" style={{ fontSize: '12px' }}>
                    {item.person.position}
                  </p>
                )}
              </div>
              {item.person && (
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-700" style={{ fontSize: '11px', fontWeight: 600 }}>
                    {item.person.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>
            Quick Navigation
          </h2>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Attendance History', icon: Clock, path: '/attendance' },
            { label: 'My Leave Requests', icon: Calendar, path: '/leave' },
            { label: 'Approval Status', icon: Shield, path: '/approvals' },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <item.icon className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700" style={{ fontSize: '14px', fontWeight: 500 }}>
                  {item.label}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 border border-red-100 text-red-600 rounded-2xl hover:bg-red-100 transition-all"
        style={{ fontSize: '14px', fontWeight: 600 }}
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>

      <p className="text-center text-gray-400 mt-5" style={{ fontSize: '12px' }}>
        PowerMatix Attendance Portal v1.0 - Copyright 2026 PowerMatix
      </p>
    </div>
  );
}
