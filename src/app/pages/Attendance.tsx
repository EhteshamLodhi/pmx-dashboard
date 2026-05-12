'use client';

import { useState, useEffect } from 'react';
import { LogIn, LogOut, Clock, CheckCircle2, Calendar, AlertTriangle, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AttendanceRecord } from '../types';

const TODAY = new Date().toISOString().split('T')[0];
const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function getStatusBadge(status: AttendanceRecord['status']) {
  switch (status) {
    case 'present': return { label: 'Present', cls: 'bg-green-100 text-green-700' };
    case 'late': return { label: 'Late', cls: 'bg-yellow-100 text-yellow-700' };
    case 'checked-in-only': return { label: 'Checked In Only', cls: 'bg-orange-100 text-orange-700' };
    case 'absent': return { label: 'Absent', cls: 'bg-red-100 text-red-700' };
    case 'on-leave': return { label: 'On Leave', cls: 'bg-blue-100 text-blue-700' };
    case 'half-day': return { label: 'Half Day', cls: 'bg-purple-100 text-purple-700' };
    default: return { label: 'Not Recorded', cls: 'bg-gray-100 text-gray-500' };
  }
}

function getDuration(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return '—';
  const [h1, m1] = checkIn.split(':').map(Number);
  const [h2, m2] = checkOut.split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) return '—';
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function LiveClock() {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span>{time}</span>;
}

export default function Attendance() {
  const { currentUser, checkIn, checkOut, getTodayRecord, getAttendanceForUser } = useApp();
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [justCheckedOut, setJustCheckedOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const todayRecord = getTodayRecord();
  const allRecords = getAttendanceForUser(currentUser?.id ?? '').sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const recentRecords = allRecords.slice(0, 7);

  const handleCheckIn = async () => {
    try {
      setActionError(null);
      await checkIn();
      setJustCheckedIn(true);
      setTimeout(() => setJustCheckedIn(false), 3000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to check in right now.');
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionError(null);
      await checkOut();
      setJustCheckedOut(true);
      setTimeout(() => setJustCheckedOut(false), 3000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to check out right now.');
    }
  };

  const canCheckIn = !todayRecord?.checkIn;
  const canCheckOut = !!todayRecord?.checkIn && !todayRecord?.checkOut;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>Attendance</h1>
        <p className="text-gray-500 mt-1" style={{ fontSize: '14px' }}>{TODAY_LABEL}</p>
      </div>

      {/* Today's status card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-500 p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-200" />
              <span className="text-green-100" style={{ fontSize: '13px' }}>Live Time</span>
            </div>
            {todayRecord && (
              <span className={`px-2 py-1 rounded-full ${
                todayRecord.status === 'present' ? 'bg-white/20 text-white' : 'bg-yellow-300/30 text-yellow-100'
              }`} style={{ fontSize: '11px', fontWeight: 600 }}>
                {getStatusBadge(todayRecord.status).label}
              </span>
            )}
          </div>
          <p className="text-white tabular-nums" style={{ fontSize: '38px', fontWeight: 700, letterSpacing: '-1px' }}>
            <LiveClock />
          </p>
          <p className="text-green-200 mt-1" style={{ fontSize: '13px' }}>
            {currentUser?.name} · {currentUser?.department}
          </p>
        </div>

        {/* Today's check-in/out info */}
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {[
            { label: 'Check In', value: todayRecord?.checkIn ?? '—' },
            { label: 'Check Out', value: todayRecord?.checkOut ?? '—' },
            { label: 'Duration', value: getDuration(todayRecord?.checkIn, todayRecord?.checkOut) },
          ].map((item) => (
            <div key={item.label} className="p-4 text-center">
              <p className="text-gray-400" style={{ fontSize: '11px' }}>{item.label}</p>
              <p className="text-gray-900 mt-0.5" style={{ fontSize: '16px', fontWeight: 600 }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* Check in / Check out actions */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Check In */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
            todayRecord?.checkIn ? 'bg-green-100' : 'bg-green-600'
          }`}>
            {todayRecord?.checkIn ? (
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            ) : (
              <LogIn className="w-8 h-8 text-white" />
            )}
          </div>
          <p className="text-gray-900 mb-1" style={{ fontSize: '16px', fontWeight: 600 }}>Check In</p>
          <p className="text-gray-400 mb-4 text-center" style={{ fontSize: '12px' }}>
            {todayRecord?.checkIn ? `Recorded at ${todayRecord.checkIn}` : 'Record your arrival time'}
          </p>

          {justCheckedIn && (
            <div className="mb-3 w-full flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Checked in successfully!</span>
            </div>
          )}

          <button
            onClick={() => void handleCheckIn()}
            disabled={!canCheckIn}
            className={`w-full py-3 rounded-xl transition-all ${
              canCheckIn
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md active:scale-95'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontSize: '14px', fontWeight: 600 }}
          >
            {todayRecord?.checkIn ? 'Already Checked In' : 'Check In Now'}
          </button>
        </div>

        {/* Check Out */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
            todayRecord?.checkOut ? 'bg-blue-100' : canCheckOut ? 'bg-blue-600' : 'bg-gray-100'
          }`}>
            {todayRecord?.checkOut ? (
              <CheckCircle2 className="w-8 h-8 text-blue-600" />
            ) : (
              <LogOut className={`w-8 h-8 ${canCheckOut ? 'text-white' : 'text-gray-400'}`} />
            )}
          </div>
          <p className="text-gray-900 mb-1" style={{ fontSize: '16px', fontWeight: 600 }}>Check Out</p>
          <p className="text-gray-400 mb-4 text-center" style={{ fontSize: '12px' }}>
            {todayRecord?.checkOut ? `Recorded at ${todayRecord.checkOut}` : 'Record your departure time'}
          </p>

          {justCheckedOut && (
            <div className="mb-3 w-full flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Checked out successfully!</span>
            </div>
          )}

          <button
            onClick={() => void handleCheckOut()}
            disabled={!canCheckOut}
            className={`w-full py-3 rounded-xl transition-all ${
              canCheckOut
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:scale-95'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontSize: '14px', fontWeight: 600 }}
          >
            {todayRecord?.checkOut ? 'Already Checked Out' : 'Check Out Now'}
          </button>
        </div>
      </div>

      {/* Policy note */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
        <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-800" style={{ fontSize: '13px', fontWeight: 600 }}>Attendance Policy</p>
          <p className="text-amber-600 mt-0.5" style={{ fontSize: '12px', lineHeight: '1.6' }}>
            Check-in and check-out are recorded using the current time only. You cannot add or modify entries for past or future dates. Contact your admin if you need to correct an entry.
          </p>
        </div>
      </div>

      {/* Recent attendance history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>Recent Attendance</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {recentRecords.map((record) => {
            const badge = getStatusBadge(record.status);
            const isToday = record.date === TODAY;
            const duration = getDuration(record.checkIn, record.checkOut);
            return (
              <div key={record.id} className={`px-5 py-3.5 flex items-center justify-between ${isToday ? 'bg-green-50/50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    record.status === 'present' ? 'bg-green-100' :
                    record.status === 'late' ? 'bg-yellow-100' :
                    record.status === 'on-leave' ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Clock className={`w-4 h-4 ${
                      record.status === 'present' ? 'text-green-600' :
                      record.status === 'late' ? 'text-yellow-600' :
                      record.status === 'on-leave' ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-gray-900" style={{ fontSize: '13px', fontWeight: 500 }}>
                        {new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                      {isToday && (
                        <span className="px-1.5 py-0.5 bg-green-600 text-white rounded" style={{ fontSize: '10px', fontWeight: 600 }}>Today</span>
                      )}
                    </div>
                    <p className="text-gray-400" style={{ fontSize: '12px' }}>
                      {record.checkIn && record.checkOut
                        ? `${record.checkIn} – ${record.checkOut} · ${duration}`
                        : record.checkIn
                        ? `In: ${record.checkIn} · Still working`
                        : '—'}
                    </p>
                    {record.editedBy && (
                      <p className="text-amber-500 flex items-center gap-1 mt-0.5" style={{ fontSize: '11px' }}>
                        <AlertTriangle className="w-3 h-3" />
                        Edited by {record.editedBy}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg ${badge.cls}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                  {badge.label}
                </span>
              </div>
            );
          })}
          {recentRecords.length === 0 && (
            <div className="px-5 py-10 text-center">
              <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400" style={{ fontSize: '14px' }}>No attendance records found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
