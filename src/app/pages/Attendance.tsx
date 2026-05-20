'use client';

import { useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, Clock, CheckCircle2, Calendar, AlertTriangle, Info, Loader2, BarChart3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AttendanceRecord, PolicySettings } from '../types';
import { formatDisplayTime } from '@/lib/time';
import { useActionRunner } from '@/app/hooks/useActionRunner';
import {
  averageTime,
  filterRecordsByRange,
  formatHours,
  getComputedAttendanceStatus,
  getDelayMinutes,
  getWorkingHours,
  type AttendanceRangeKey,
} from '@/lib/attendance-analytics';

const TODAY = new Date().toISOString().split('T')[0];
const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function getStatusBadge(status: AttendanceRecord['status']) {
  switch (status) {
    case 'present':
      return { label: 'Present', cls: 'bg-green-100 text-green-700' };
    case 'late':
      return { label: 'Late', cls: 'bg-yellow-100 text-yellow-700' };
    case 'checked-in-only':
      return { label: 'Checked In Only', cls: 'bg-orange-100 text-orange-700' };
    case 'absent':
      return { label: 'Absent', cls: 'bg-red-100 text-red-700' };
    case 'on-leave':
      return { label: 'On Leave', cls: 'bg-blue-100 text-blue-700' };
    case 'half-day':
      return { label: 'Half Day', cls: 'bg-purple-100 text-purple-700' };
    default:
      return { label: 'Not Recorded', cls: 'bg-gray-100 text-gray-500' };
  }
}

function getDuration(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return '-';
  const [h1, m1] = checkIn.split(':').map(Number);
  const [h2, m2] = checkOut.split(':').map(Number);
  const diff = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diff <= 0) return '-';
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function LiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return <span>{time}</span>;
}

export default function Attendance() {
  const { currentUser, checkIn, checkOut, getTodayRecord, getAttendanceForUser } = useApp();
  const { isPending, runAction } = useActionRunner();
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [justCheckedOut, setJustCheckedOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [range, setRange] = useState<AttendanceRangeKey>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [policy, setPolicy] = useState<PolicySettings | null>(null);

  const todayRecord = getTodayRecord();
  const allRecords = useMemo(
    () => [...getAttendanceForUser(currentUser?.id ?? '')].sort((a, b) => b.date.localeCompare(a.date)),
    [currentUser?.id, getAttendanceForUser],
  );
  const filteredRecords = useMemo(
    () => filterRecordsByRange(allRecords, range, customStart, customEnd),
    [allRecords, customEnd, customStart, range],
  );
  const recentRecords = filteredRecords.slice(0, 10);

  useEffect(() => {
    fetch('/api/admin/policies', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data) setPolicy(body.data);
      })
      .catch(() => setPolicy(null));
  }, []);

  const analytics = useMemo(() => {
    const totalWorkingHours = filteredRecords.reduce((sum, record) => sum + getWorkingHours(record), 0);
    const totalLateDays = filteredRecords.filter((record) => {
      const status = getComputedAttendanceStatus(record, currentUser ?? undefined, policy);
      return status === 'Late' || status === 'Very Late';
    }).length;

    return {
      averageArrival: averageTime(filteredRecords.filter((record) => record.checkIn), 'checkIn'),
      averageDeparture: averageTime(filteredRecords.filter((record) => record.checkOut), 'checkOut'),
      totalWorkingHours,
      totalPresentDays: filteredRecords.filter((record) => record.status === 'present' || record.status === 'late' || record.status === 'checked-in-only').length,
      totalLateDays,
      totalAbsentDays: filteredRecords.filter((record) => record.status === 'absent' || !record.checkIn).length,
    };
  }, [currentUser, filteredRecords, policy]);

  if (!currentUser) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: '14px' }}>
            Loading attendance...
          </p>
        </div>
      </div>
    );
  }

  const handleCheckIn = async () => {
    await runAction('attendance-check-in', async () => {
      setActionError(null);
      await checkIn();
      setJustCheckedIn(true);
      setTimeout(() => setJustCheckedIn(false), 3000);
    }, {
      loading: 'Recording check-in...',
      success: 'Checked in successfully.',
      error: 'Unable to check in right now.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to check in right now.');
    });
  };

  const handleCheckOut = async () => {
    await runAction('attendance-check-out', async () => {
      setActionError(null);
      await checkOut();
      setJustCheckedOut(true);
      setTimeout(() => setJustCheckedOut(false), 3000);
    }, {
      loading: 'Recording check-out...',
      success: 'Checked out successfully.',
      error: 'Unable to check out right now.',
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : 'Unable to check out right now.');
    });
  };

  const canCheckIn = !todayRecord?.checkIn;
  const canCheckOut = !!todayRecord?.checkIn && !todayRecord?.checkOut;
  const checkingIn = isPending('attendance-check-in');
  const checkingOut = isPending('attendance-check-out');

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-gray-900" style={{ fontSize: '22px', fontWeight: 700 }}>
          Attendance
        </h1>
        <p className="text-gray-500 mt-1" style={{ fontSize: '14px' }}>
          {TODAY_LABEL}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-500 p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-200" />
              <span className="text-green-100" style={{ fontSize: '13px' }}>
                Live Time
              </span>
            </div>
            {todayRecord && (
              <span
                className={`px-2 py-1 rounded-full ${
                  todayRecord.status === 'present'
                    ? 'bg-white/20 text-white'
                    : 'bg-yellow-300/30 text-yellow-100'
                }`}
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {getStatusBadge(todayRecord.status).label}
              </span>
            )}
          </div>
          <p className="text-white tabular-nums" style={{ fontSize: '38px', fontWeight: 700, letterSpacing: '-1px' }}>
            <LiveClock />
          </p>
          <p className="text-green-200 mt-1" style={{ fontSize: '13px' }}>
            {currentUser?.name} - {currentUser?.project ?? 'Unassigned'}
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {[
            { label: 'Check In', value: formatDisplayTime(todayRecord?.checkIn) },
            { label: 'Check Out', value: formatDisplayTime(todayRecord?.checkOut) },
            { label: 'Duration', value: getDuration(todayRecord?.checkIn, todayRecord?.checkOut) },
          ].map((item) => (
            <div key={item.label} className="p-4 text-center">
              <p className="text-gray-400" style={{ fontSize: '11px' }}>
                {item.label}
              </p>
              <p className="text-gray-900 mt-0.5" style={{ fontSize: '16px', fontWeight: 600 }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
              todayRecord?.checkIn ? 'bg-green-100' : 'bg-green-600'
            }`}
          >
            {todayRecord?.checkIn ? (
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            ) : (
              <LogIn className="w-8 h-8 text-white" />
            )}
          </div>
          <p className="text-gray-900 mb-1" style={{ fontSize: '16px', fontWeight: 600 }}>
            Check In
          </p>
          <p className="text-gray-400 mb-4 text-center" style={{ fontSize: '12px' }}>
            {todayRecord?.checkIn
              ? `Recorded at ${formatDisplayTime(todayRecord.checkIn)}`
              : 'Record your arrival time'}
          </p>

          {justCheckedIn && (
            <div className="mb-3 w-full flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Checked in successfully!</span>
            </div>
          )}

          <button
            onClick={() => void handleCheckIn()}
            disabled={!canCheckIn || checkingIn}
            className={`w-full py-3 rounded-xl transition-all ${
              canCheckIn && !checkingIn
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md active:scale-95'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontSize: '14px', fontWeight: 600 }}
          >
            {checkingIn ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking In...
              </span>
            ) : todayRecord?.checkIn ? 'Already Checked In' : 'Check In Now'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
              todayRecord?.checkOut ? 'bg-blue-100' : canCheckOut ? 'bg-blue-600' : 'bg-gray-100'
            }`}
          >
            {todayRecord?.checkOut ? (
              <CheckCircle2 className="w-8 h-8 text-blue-600" />
            ) : (
              <LogOut className={`w-8 h-8 ${canCheckOut ? 'text-white' : 'text-gray-400'}`} />
            )}
          </div>
          <p className="text-gray-900 mb-1" style={{ fontSize: '16px', fontWeight: 600 }}>
            Check Out
          </p>
          <p className="text-gray-400 mb-4 text-center" style={{ fontSize: '12px' }}>
            {todayRecord?.checkOut
              ? `Recorded at ${formatDisplayTime(todayRecord.checkOut)}`
              : 'Record your departure time'}
          </p>

          {justCheckedOut && (
            <div className="mb-3 w-full flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Checked out successfully!</span>
            </div>
          )}

          <button
            onClick={() => void handleCheckOut()}
            disabled={!canCheckOut || checkingOut}
            className={`w-full py-3 rounded-xl transition-all ${
              canCheckOut && !checkingOut
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:scale-95'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontSize: '14px', fontWeight: 600 }}
          >
            {checkingOut ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking Out...
              </span>
            ) : todayRecord?.checkOut ? 'Already Checked Out' : 'Check Out Now'}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
        <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-800" style={{ fontSize: '13px', fontWeight: 600 }}>
            Attendance Policy
          </p>
          <p className="text-amber-600 mt-0.5" style={{ fontSize: '12px', lineHeight: '1.6' }}>
            Check-in and check-out are recorded using the current time only. You cannot add or modify
            entries for past or future dates. Contact your admin if you need to correct an entry.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-green-600" />
            <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>
              Attendance Insights
            </h2>
          </div>
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as AttendanceRangeKey)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontSize: '12px', fontWeight: 600 }}
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {range === 'custom' && (
          <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-2 gap-3 bg-gray-50/60">
            <input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-5">
          {[
            { label: 'Average Arrival', value: formatDisplayTime(analytics.averageArrival), tone: 'text-green-700 bg-green-50' },
            { label: 'Average Departure', value: formatDisplayTime(analytics.averageDeparture), tone: 'text-blue-700 bg-blue-50' },
            { label: 'Working Hours', value: formatHours(analytics.totalWorkingHours), tone: 'text-gray-800 bg-gray-50' },
            { label: 'Present Days', value: analytics.totalPresentDays, tone: 'text-green-700 bg-green-50' },
            { label: 'Late Days', value: analytics.totalLateDays, tone: 'text-orange-700 bg-orange-50' },
            { label: 'Absent Days', value: analytics.totalAbsentDays, tone: 'text-red-700 bg-red-50' },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl p-4 ${item.tone}`}>
              <p style={{ fontSize: '12px', fontWeight: 600 }}>{item.label}</p>
              <p className="mt-1" style={{ fontSize: '20px', fontWeight: 700 }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h2 className="text-gray-900" style={{ fontSize: '15px', fontWeight: 600 }}>
            Attendance History
          </h2>
        </div>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-2 border-b border-gray-100 bg-gray-50 text-gray-400 uppercase text-[11px] font-bold tracking-wide">
          <span className="col-span-4">Date</span>
          <span className="col-span-2">Time</span>
          <span className="col-span-2">Working Hours</span>
          <span className="col-span-2">Delay Minutes</span>
          <span className="col-span-2">Status</span>
        </div>
        <div className="divide-y divide-gray-50">
          {recentRecords.map((record) => {
            const badge = getStatusBadge(record.status);
            const isToday = record.date === TODAY;
            const duration = getDuration(record.checkIn, record.checkOut);
            const delayMinutes = getDelayMinutes(record, currentUser, policy);
            const computedStatus = getComputedAttendanceStatus(record, currentUser, policy);

            return (
              <div
                key={record.id}
                className={`px-5 py-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 md:items-center ${isToday ? 'bg-green-50/50' : ''}`}
              >
                <div className="md:col-span-4 flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      record.status === 'present'
                        ? 'bg-green-100'
                        : record.status === 'late'
                          ? 'bg-yellow-100'
                          : record.status === 'on-leave'
                            ? 'bg-blue-100'
                            : 'bg-gray-100'
                    }`}
                  >
                    <Clock
                      className={`w-4 h-4 ${
                        record.status === 'present'
                          ? 'text-green-600'
                          : record.status === 'late'
                            ? 'text-yellow-600'
                            : record.status === 'on-leave'
                              ? 'text-blue-600'
                              : 'text-gray-400'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-gray-900" style={{ fontSize: '13px', fontWeight: 500 }}>
                        {new Date(record.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      {isToday && (
                        <span
                          className="px-1.5 py-0.5 bg-green-600 text-white rounded"
                          style={{ fontSize: '10px', fontWeight: 600 }}
                        >
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400" style={{ fontSize: '12px' }}>
                      {record.checkIn && record.checkOut
                        ? `${formatDisplayTime(record.checkIn)} - ${formatDisplayTime(record.checkOut)} - ${duration}`
                        : record.checkIn
                          ? `In: ${formatDisplayTime(record.checkIn)} - Still working`
                          : '-'}
                    </p>
                    {record.editedBy && (
                      <p className="text-amber-500 flex items-center gap-1 mt-0.5" style={{ fontSize: '11px' }}>
                        <AlertTriangle className="w-3 h-3" />
                        Edited by {record.editedBy}
                      </p>
                    )}
                  </div>
                </div>
                <div className="md:col-span-2 text-gray-600" style={{ fontSize: '12px' }}>
                  {record.checkIn && record.checkOut
                    ? `${formatDisplayTime(record.checkIn)} - ${formatDisplayTime(record.checkOut)}`
                    : record.checkIn
                      ? `In: ${formatDisplayTime(record.checkIn)}`
                      : '-'}
                </div>
                <div className="md:col-span-2 text-gray-700" style={{ fontSize: '12px', fontWeight: 600 }}>
                  {duration}
                </div>
                <div className="md:col-span-2 text-gray-700" style={{ fontSize: '12px', fontWeight: 600 }}>
                  {delayMinutes === null ? '-' : `${delayMinutes}m`}
                </div>
                <div className="md:col-span-2">
                  <span className={`px-2.5 py-1 rounded-lg ${badge.cls}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                    {computedStatus}
                  </span>
                </div>
              </div>
            );
          })}
          {recentRecords.length === 0 && (
            <div className="px-5 py-10 text-center">
              <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400" style={{ fontSize: '14px' }}>
                No attendance records found
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
