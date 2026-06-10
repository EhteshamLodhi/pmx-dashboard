'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LineChart,
  Search,
  Shield,
  TrendingDown,
  TrendingUp,
  UserCircle,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AttendanceRecord, LeaveRequest, PolicySettings, ReimbursementRequest, User } from '../types';
import { formatDisplayTime } from '@/lib/time';
import {
  averageTime,
  filterRecordsByRange,
  formatHours,
  getComputedAttendanceStatus,
  getDelayMinutes,
  getPerformanceScore,
  getRangeBounds,
  getWorkingHours,
  minutesFromTime,
  timeFromMinutes,
  type AttendanceRangeKey,
} from '@/lib/attendance-analytics';
import { getNonWorkingStatus } from '@/lib/attendance-calendar';
import { getVisibleUsersForHierarchy } from '@/lib/hierarchy';
import { mapReimbursementRequest } from '@/lib/supabase/mappers';

const TODAY = new Date().toISOString().split('T')[0];

function monthKey(date: string) {
  return date.slice(0, 7);
}

function previousMonthKey() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function dayName(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}

function dateLabel(date?: string) {
  if (!date) return '-';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function currentStatusLabel(record?: AttendanceRecord, user?: User, policy?: PolicySettings | null) {
  if (!record) return 'Absent';
  return getComputedAttendanceStatus(record, user, policy);
}

function commonTime(records: AttendanceRecord[], key: 'checkIn' | 'checkOut') {
  const buckets = new Map<number, number>();
  records.forEach((record) => {
    const minutes = minutesFromTime(record[key]);
    if (minutes === null) return;
    const bucket = Math.round(minutes / 15) * 15;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });
  const winner = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner ? timeFromMinutes(winner[0]) : undefined;
}

function longestStreak(records: AttendanceRecord[]) {
  const presentDates = new Set(
    records
      .filter((record) => record.checkIn && record.status !== 'absent' && record.status !== 'weekly-off' && record.status !== 'holiday')
      .map((record) => record.date),
  );
  const sortedDates = [...presentDates].sort();
  let best = 0;
  let current = 0;
  let previous: Date | null = null;

  sortedDates.forEach((isoDate) => {
    const date = new Date(`${isoDate}T00:00:00`);
    if (previous) {
      const diff = Math.round((date.getTime() - previous.getTime()) / 86_400_000);
      current = diff === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    previous = date;
  });

  return best;
}

function currentStreak(records: AttendanceRecord[]) {
  const presentDates = new Set(
    records
      .filter((record) => record.checkIn && record.status !== 'absent' && record.status !== 'weekly-off' && record.status !== 'holiday')
      .map((record) => record.date),
  );
  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 90; index += 1) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (!presentDates.has(iso)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function weekdayHours(records: AttendanceRecord[]) {
  const buckets = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
    label: day.slice(0, 3),
    day,
    hours: 0,
    count: 0,
  }));

  records.forEach((record) => {
    const day = dayName(record.date);
    const bucket = buckets.find((item) => item.day === day);
    if (!bucket) return;
    bucket.hours += getWorkingHours(record);
    bucket.count += 1;
  });

  return buckets.map((item) => ({
    label: item.label,
    value: item.count ? Number((item.hours / item.count).toFixed(1)) : 0,
  }));
}

function monthlyTrend(records: AttendanceRecord[]) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      hours: 0,
      present: 0,
      total: 0,
    };
  });

  records.forEach((record) => {
    const bucket = months.find((item) => item.key === monthKey(record.date));
    if (!bucket) return;
    bucket.total += 1;
    bucket.hours += getWorkingHours(record);
    if (record.checkIn && record.status !== 'absent') bucket.present += 1;
  });

  return months.map((item) => ({
    ...item,
    attendance: percent(item.present, item.total),
  }));
}

function leaveTypeCounts(requests: LeaveRequest[]) {
  const approved = requests.filter((request) => request.status === 'approved');
  return [
    { label: 'Sick', value: approved.filter((request) => request.type === 'sick').reduce((sum, request) => sum + request.totalDays, 0), color: 'bg-red-500' },
    { label: 'Casual', value: approved.filter((request) => request.type === 'casual').reduce((sum, request) => sum + request.totalDays, 0), color: 'bg-blue-500' },
    { label: 'Annual', value: approved.filter((request) => request.type === 'annual').reduce((sum, request) => sum + request.totalDays, 0), color: 'bg-purple-500' },
    { label: 'Emergency', value: approved.filter((request) => request.type === 'emergency').reduce((sum, request) => sum + request.totalDays, 0), color: 'bg-rose-500' },
  ];
}

function MetricCard({ label, value, tone = 'green' }: { label: string; value: string | number; tone?: 'green' | 'blue' | 'orange' | 'red' | 'gray' }) {
  const toneClass = {
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-700',
  }[tone];

  return (
    <div className={`rounded-xl p-4 ${toneClass}`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniBarChart({ data, color = 'bg-green-500' }: { data: Array<{ label: string; value: number }>; color?: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="flex items-end gap-2 h-36 pt-4">
      {data.map((item) => (
        <div key={item.label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
          <div className="w-full rounded-t-lg bg-gray-100 flex items-end h-24 overflow-hidden">
            <div className={`w-full rounded-t-lg ${color}`} style={{ height: `${Math.max(6, (item.value / max) * 96)}px` }} />
          </div>
          <span className="text-[10px] text-gray-400 truncate">{item.label}</span>
          <span className="text-[10px] font-semibold text-gray-600">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function RankingList({ title, rows }: { title: string; rows: Array<{ name: string; value: string | number }> }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-gray-900 font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">No data available.</p>
        ) : rows.map((row, index) => (
          <div key={`${row.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-white text-green-700 flex items-center justify-center text-xs font-bold">{index + 1}</span>
              <span className="text-sm text-gray-700 font-semibold truncate">{row.name}</span>
            </div>
            <span className="text-sm text-gray-500 font-semibold">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EmployeeInsights() {
  const { currentUser, users, attendanceRecords, leaveRequests, holidays } = useApp();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [range, setRange] = useState<AttendanceRangeKey>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'date-desc' | 'date-asc' | 'late-desc' | 'hours-desc'>('date-desc');
  const [historyPage, setHistoryPage] = useState(1);
  const [policy, setPolicy] = useState<PolicySettings | null>(null);
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);

  useEffect(() => {
    fetch('/api/admin/policies', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data) setPolicy(body.data);
      })
      .catch(() => setPolicy(null));
  }, []);

  useEffect(() => {
    if (!currentUser || !['manager', 'director', 'admin'].includes(currentUser.role)) return;
    fetch('/api/reimbursements', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data) setReimbursements(body.data.map(mapReimbursementRequest));
      })
      .catch(() => setReimbursements([]));
  }, [currentUser]);

  const visibleUsers = useMemo(() => {
    if (!currentUser) return [];
    return getVisibleUsersForHierarchy(currentUser, users.filter((user) => user.isActive));
  }, [currentUser, users]);

  useEffect(() => {
    if (!currentUser) return;
    if (!selectedUserId || !visibleUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(currentUser.role === 'employee' ? currentUser.id : visibleUsers[0]?.id ?? currentUser.id);
    }
  }, [currentUser, selectedUserId, visibleUsers]);

  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) ?? currentUser ?? undefined;
  const selectedRecords = useMemo(
    () => attendanceRecords.filter((record) => record.userId === selectedUser?.id).sort((a, b) => a.date.localeCompare(b.date)),
    [attendanceRecords, selectedUser?.id],
  );
  const rangeBounds = useMemo(() => getRangeBounds(range, customStart, customEnd), [customEnd, customStart, range]);
  const analysisRecords = useMemo(
    () => filterRecordsByRange(selectedRecords, range, customStart, customEnd),
    [customEnd, customStart, range, selectedRecords],
  );
  const selectedLeaves = useMemo(
    () => leaveRequests.filter((request) => request.userId === selectedUser?.id),
    [leaveRequests, selectedUser?.id],
  );
  const filteredLeaves = useMemo(
    () => selectedLeaves.filter((request) => request.startDate <= rangeBounds.end && request.endDate >= rangeBounds.start),
    [rangeBounds.end, rangeBounds.start, selectedLeaves],
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historySort, range, customStart, customEnd, selectedUser?.id]);

  const todayRecord = attendanceRecords.find((record) => record.userId === selectedUser?.id && record.date === TODAY);
  const monthRecords = analysisRecords.filter((record) => monthKey(record.date) === monthKey(TODAY));
  const lastMonthRecords = analysisRecords.filter((record) => monthKey(record.date) === previousMonthKey());
  const yearLeaves = filteredLeaves.filter((request) => request.startDate.slice(0, 4) === TODAY.slice(0, 4));
  const approvedLeaves = filteredLeaves.filter((request) => request.status === 'approved');
  const upcomingLeaves = approvedLeaves.filter((request) => request.startDate >= TODAY).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const trackedRecords = analysisRecords.filter((record) => record.status !== 'holiday' && record.status !== 'weekly-off' && record.status !== 'on-leave');
  const presentRecords = trackedRecords.filter((record) => record.checkIn && record.status !== 'absent');
  const lateRecords = trackedRecords.filter((record) => {
    const status = getComputedAttendanceStatus(record, selectedUser, policy);
    return status === 'Late' || status === 'Very Late';
  });
  const earlyDepartures = trackedRecords.filter((record) => record.checkOut && getWorkingHours(record) > 0 && getWorkingHours(record) < 8);
  const missedCheckIns = trackedRecords.filter((record) => !record.checkIn).length;
  const missedCheckOuts = trackedRecords.filter((record) => record.checkIn && !record.checkOut).length;
  const totalHours = analysisRecords.reduce((sum, record) => sum + getWorkingHours(record), 0);
  const monthlyTrendData = monthlyTrend(analysisRecords);
  const weekdayData = weekdayHours(analysisRecords);
  const leaveBreakdown = leaveTypeCounts(filteredLeaves);
  const currentMonthHours = monthRecords.reduce((sum, record) => sum + getWorkingHours(record), 0);
  const lastMonthHours = lastMonthRecords.reduce((sum, record) => sum + getWorkingHours(record), 0);
  const weeklyAverageHours = analysisRecords.length ? totalHours / Math.max(1, new Set(analysisRecords.map((record) => record.date.slice(0, 8))).size) : 0;
  const monthlyAverageHours = analysisRecords.length ? totalHours / Math.max(1, new Set(analysisRecords.map((record) => monthKey(record.date))).size) : 0;
  const longestDay = [...analysisRecords].sort((a, b) => getWorkingHours(b) - getWorkingHours(a))[0];
  const shortestDay = [...analysisRecords].filter((record) => getWorkingHours(record) > 0).sort((a, b) => getWorkingHours(a) - getWorkingHours(b))[0];
  const lateDayCounts = lateRecords.reduce<Record<string, number>>((acc, record) => {
    const day = dayName(record.date);
    acc[day] = (acc[day] ?? 0) + 1;
    return acc;
  }, {});
  const mostLateDay = Object.entries(lateDayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
  const productiveDay = weekdayData.sort((a, b) => b.value - a.value)[0]?.label ?? '-';
  const attendancePercentage = percent(presentRecords.length, trackedRecords.length);
  const latePercentage = percent(lateRecords.length, trackedRecords.length);
  const earlyDeparturePercentage = percent(earlyDepartures.length, trackedRecords.length);
  const performanceScore = selectedUser ? getPerformanceScore(analysisRecords, selectedUser, policy) : 0;
  const reliabilityScore = Math.max(0, Math.min(100, attendancePercentage - Math.round(missedCheckOuts * 2)));
  const punctualityScore = Math.max(0, 100 - latePercentage);
  const consistencyScore = Math.max(0, Math.min(100, Math.round((attendancePercentage + punctualityScore + reliabilityScore) / 3)));

  const leaveTotals = {
    sick: approvedLeaves.filter((request) => request.type === 'sick').reduce((sum, request) => sum + request.totalDays, 0),
    casual: approvedLeaves.filter((request) => request.type === 'casual').reduce((sum, request) => sum + request.totalDays, 0),
    annual: approvedLeaves.filter((request) => request.type === 'annual').reduce((sum, request) => sum + request.totalDays, 0),
  };
  const totalLeaveBalance =
    (selectedUser?.sickLeaveDays ?? 0) +
    (selectedUser?.casualLeaveDays ?? 0) +
    (selectedUser?.annualLeaveDays ?? 0);
  const leavesTaken = approvedLeaves.reduce((sum, request) => sum + request.totalDays, 0);

  const orgRows = useMemo(() => {
    return users.filter((user) => user.isActive).map((user) => {
      const records = attendanceRecords.filter((record) => record.userId === user.id);
      const tracked = records.filter((record) => record.status !== 'holiday' && record.status !== 'weekly-off' && record.status !== 'on-leave');
      const present = tracked.filter((record) => record.checkIn && record.status !== 'absent').length;
      const late = tracked.filter((record) => {
        const status = getComputedAttendanceStatus(record, user, policy);
        return status === 'Late' || status === 'Very Late';
      }).length;
      const hours = records.reduce((sum, record) => sum + getWorkingHours(record), 0);
      return {
        user,
        todayRecord: attendanceRecords.find((record) => record.userId === user.id && record.date === TODAY),
        attendancePercentage: percent(present, tracked.length),
        late,
        hours,
        score: getPerformanceScore(records, user, policy),
      };
    });
  }, [attendanceRecords, policy, users]);

  const todaySummary = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive);
    return activeUsers.map((user) => {
      const record = attendanceRecords.find((item) => item.userId === user.id && item.date === TODAY);
      const nonWorkingStatus = getNonWorkingStatus({ date: TODAY, userId: user.id, holidays, policy, leaveRequests });
      return { user, status: record?.status ?? nonWorkingStatus ?? 'absent' };
    });
  }, [attendanceRecords, holidays, leaveRequests, policy, users]);

  const projectSummary = useMemo(() => {
    const groups = new Map<string, { total: number; present: number; leave: number }>();
    todaySummary.forEach(({ user, status }) => {
      const key = user.project ?? 'Unassigned';
      const next = groups.get(key) ?? { total: 0, present: 0, leave: 0 };
      next.total += 1;
      if (status === 'present' || status === 'checked-in-only' || status === 'late') next.present += 1;
      if (status === 'on-leave') next.leave += 1;
      groups.set(key, next);
    });
    return [...groups.entries()].map(([project, item]) => ({
      project,
      ...item,
      percentage: percent(item.present, item.total),
    }));
  }, [todaySummary]);

  const historyRows = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const filtered = analysisRecords.filter((record) => {
      if (!query) return true;
      const status = getComputedAttendanceStatus(record, selectedUser, policy).toLowerCase();
      return `${record.date} ${record.checkIn ?? ''} ${record.checkOut ?? ''} ${record.notes ?? ''} ${status}`.toLowerCase().includes(query);
    });

    return [...filtered].sort((a, b) => {
      if (historySort === 'date-asc') return a.date.localeCompare(b.date);
      if (historySort === 'late-desc') return (getDelayMinutes(b, selectedUser, policy) ?? 0) - (getDelayMinutes(a, selectedUser, policy) ?? 0);
      if (historySort === 'hours-desc') return getWorkingHours(b) - getWorkingHours(a);
      return b.date.localeCompare(a.date);
    });
  }, [analysisRecords, historySearch, historySort, policy, selectedUser]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(historyRows.length / pageSize));
  const currentHistoryPage = Math.min(historyPage, pageCount);
  const paginatedHistoryRows = historyRows.slice((currentHistoryPage - 1) * pageSize, currentHistoryPage * pageSize);

  if (!selectedUser) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-500">
          Loading employee insights...
        </div>
      </div>
    );
  }

  const canSeeOrg = currentUser?.role === 'admin' || currentUser?.role === 'director';
  const lineManager = users.find((user) => user.id === selectedUser.lineManagerId);
  const projectManager = users.find((user) => user.id === selectedUser.projectManagerId);
  const director = users.find((user) => user.id === selectedUser.directorId);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-gray-900 text-2xl font-bold">Employee Insights</h1>
          <p className="text-gray-500 text-sm mt-1">
            Attendance intelligence, leave utilization, and productivity patterns.
          </p>
        </div>
        {visibleUsers.length > 1 && (
          <select
            value={selectedUser.id}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="w-full lg:w-80 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-green-500 text-sm font-semibold"
          >
            {visibleUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.name} - {user.position}</option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['custom', 'Today'],
              ['week', 'This Week'],
              ['month', 'This Month'],
              ['quarter', 'This Quarter'],
              ['year', 'This Year'],
            ].map(([key, label]) => (
              <button
                key={label}
                onClick={() => {
                  if (label === 'Today') {
                    setRange('custom');
                    setCustomStart(TODAY);
                    setCustomEnd(TODAY);
                    return;
                  }
                  setRange(key as AttendanceRangeKey);
                }}
                className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                  (label === 'Today' ? range === 'custom' && customStart === TODAY && customEnd === TODAY : range === key)
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                range === 'custom' && !(customStart === TODAY && customEnd === TODAY)
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              Custom Range
            </button>
          </div>
          {range === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Showing analytics from {dateLabel(rangeBounds.start)} to {dateLabel(rangeBounds.end)}.
        </p>
      </div>

      {canSeeOrg && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <MetricCard label="Total Users" value={users.filter((user) => user.isActive).length} tone="gray" />
          <MetricCard label="Present Today" value={todaySummary.filter((row) => row.status === 'present' || row.status === 'checked-in-only').length} />
          <MetricCard label="Absent Today" value={todaySummary.filter((row) => row.status === 'absent').length} tone="red" />
          <MetricCard label="Late Today" value={todaySummary.filter((row) => row.status === 'late').length} tone="orange" />
          <MetricCard label="On Leave" value={todaySummary.filter((row) => row.status === 'on-leave').length} tone="blue" />
          <MetricCard label="Pending Leaves" value={leaveRequests.filter((request) => request.status.startsWith('pending')).length} tone="orange" />
          <MetricCard label="Pending Claims" value={reimbursements.filter((request) => request.status.startsWith('pending')).length} tone="orange" />
          <MetricCard label="Avg Attendance" value={`${Math.round(orgRows.reduce((sum, row) => sum + row.attendancePercentage, 0) / Math.max(1, orgRows.length))}%`} />
        </div>
      )}

      {canSeeOrg && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <RankingList title="Top Punctual Employees" rows={[...orgRows].sort((a, b) => b.score - a.score).slice(0, 5).map((row) => ({ name: row.user.name, value: row.score }))} />
          <RankingList title="Most Late Arrivals" rows={[...orgRows].sort((a, b) => b.late - a.late).slice(0, 5).map((row) => ({ name: row.user.name, value: row.late }))} />
          <RankingList title="Highest Attendance" rows={[...orgRows].sort((a, b) => b.attendancePercentage - a.attendancePercentage).slice(0, 5).map((row) => ({ name: row.user.name, value: `${row.attendancePercentage}%` }))} />
          <RankingList title="Lowest Attendance" rows={[...orgRows].sort((a, b) => a.attendancePercentage - b.attendancePercentage).slice(0, 5).map((row) => ({ name: row.user.name, value: `${row.attendancePercentage}%` }))} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-green-700 to-green-600 p-5 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <UserCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedUser.name}</p>
                <p className="text-green-100 text-sm">{selectedUser.position} - {selectedUser.project ?? 'Unassigned'}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/15 px-4 py-3">
              <p className="text-green-100 text-xs font-semibold">Current Attendance Status</p>
              <p className="text-white text-xl font-bold mt-1">{currentStatusLabel(todayRecord, selectedUser, policy)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 p-5">
          {[
            ['Project', selectedUser.project ?? 'Unassigned'],
            ['Designation', selectedUser.position],
            ['Reporting Time', formatDisplayTime(selectedUser.reportingTime)],
            ['Join Date', dateLabel(selectedUser.joinDate)],
            ['Active Status', selectedUser.isActive ? 'Active' : 'Inactive'],
            ['Line Manager', lineManager?.name ?? 'Unassigned'],
            ['Project Manager', projectManager?.name ?? 'Unassigned'],
            ['Director', director?.name ?? 'Unassigned'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-400 font-semibold">{label}</p>
              <p className="text-sm text-gray-800 font-semibold mt-1">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-green-600" />
          <h2 className="text-gray-900 font-bold text-lg">Attendance Analytics</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <MetricCard label="Avg Check-In" value={formatDisplayTime(averageTime(analysisRecords, 'checkIn'))} />
          <MetricCard label="Avg Check-Out" value={formatDisplayTime(averageTime(analysisRecords, 'checkOut'))} tone="blue" />
          <MetricCard label="Avg Daily Hours" value={formatHours(totalHours / Math.max(1, presentRecords.length))} tone="gray" />
          <MetricCard label="Avg Weekly Hours" value={formatHours(weeklyAverageHours)} tone="gray" />
          <MetricCard label="Avg Monthly Hours" value={formatHours(monthlyAverageHours)} tone="gray" />
          <MetricCard label="Total Hours" value={formatHours(totalHours)} />
          <MetricCard label="This Month" value={formatHours(currentMonthHours)} />
          <MetricCard label="Last Month" value={formatHours(lastMonthHours)} tone="blue" />
          <MetricCard label="Attendance %" value={`${attendancePercentage}%`} />
          <MetricCard label="Late %" value={`${latePercentage}%`} tone="orange" />
          <MetricCard label="Early Departure %" value={`${earlyDeparturePercentage}%`} tone="orange" />
          <MetricCard label="Missed Check-Out" value={missedCheckOuts} tone="red" />
          <MetricCard label="Missed Check-In" value={missedCheckIns} tone="red" />
          <MetricCard label="Holiday Records" value={analysisRecords.filter((record) => record.status === 'holiday').length} tone="blue" />
          <MetricCard label="Weekly Off Records" value={analysisRecords.filter((record) => record.status === 'weekly-off').length} tone="gray" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-green-600" />
          <h2 className="text-gray-900 font-bold text-lg">Leave Analytics</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <MetricCard label="Leave Balance" value={Math.max(0, totalLeaveBalance - leavesTaken)} />
          <MetricCard label="Sick Remaining" value={Math.max(0, (selectedUser.sickLeaveDays ?? 0) - leaveTotals.sick)} tone="red" />
          <MetricCard label="Casual Remaining" value={Math.max(0, (selectedUser.casualLeaveDays ?? 0) - leaveTotals.casual)} tone="blue" />
          <MetricCard label="Annual Remaining" value={Math.max(0, (selectedUser.annualLeaveDays ?? 0) - leaveTotals.annual)} tone="gray" />
          <MetricCard label="Leaves Taken" value={leavesTaken} />
          <MetricCard label="Used This Month" value={approvedLeaves.filter((request) => request.startDate.slice(0, 7) === monthKey(TODAY)).reduce((sum, request) => sum + request.totalDays, 0)} />
          <MetricCard label="Used This Year" value={yearLeaves.filter((request) => request.status === 'approved').reduce((sum, request) => sum + request.totalDays, 0)} />
          <MetricCard label="Upcoming" value={upcomingLeaves.length} tone="blue" />
          <MetricCard label="Pending" value={selectedLeaves.filter((request) => request.status.startsWith('pending')).length} tone="orange" />
          <MetricCard label="Rejected" value={selectedLeaves.filter((request) => request.status === 'rejected').length} tone="red" />
          <MetricCard label="Approved" value={approvedLeaves.length} />
          <MetricCard label="Cancelled" value={0} tone="gray" />
          <MetricCard label="Utilization" value={`${percent(leavesTaken, totalLeaveBalance)}%`} tone="orange" />
          <MetricCard label="Next Leave" value={upcomingLeaves[0] ? dateLabel(upcomingLeaves[0].startDate) : '-'} tone="blue" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-green-600" />
          <h2 className="text-gray-900 font-bold text-lg">Performance & Productivity Insights</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <MetricCard label="Common Check-In" value={formatDisplayTime(commonTime(analysisRecords, 'checkIn'))} />
          <MetricCard label="Common Check-Out" value={formatDisplayTime(commonTime(analysisRecords, 'checkOut'))} tone="blue" />
          <MetricCard label="Productive Day" value={productiveDay} />
          <MetricCard label="Frequent Late Day" value={mostLateDay} tone="orange" />
          <MetricCard label="Longest Day" value={longestDay ? `${dateLabel(longestDay.date)} (${formatHours(getWorkingHours(longestDay))})` : '-'} />
          <MetricCard label="Shortest Day" value={shortestDay ? `${dateLabel(shortestDay.date)} (${formatHours(getWorkingHours(shortestDay))})` : '-'} tone="gray" />
          <MetricCard label="Longest Streak" value={longestStreak(analysisRecords)} />
          <MetricCard label="Current Streak" value={currentStreak(analysisRecords)} />
          <MetricCard label="Consistency" value={`${consistencyScore}%`} />
          <MetricCard label="Punctuality" value={`${punctualityScore}%`} tone="orange" />
          <MetricCard label="Reliability" value={`${reliabilityScore}%`} tone="blue" />
          <MetricCard label="Score" value={performanceScore} tone="gray" />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-600" />
            <div>
              <h2 className="text-gray-900 font-bold text-lg">Attendance History</h2>
              <p className="text-xs text-gray-400">{historyRows.length} record{historyRows.length === 1 ? '' : 's'} in selected period</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search history"
                className="w-full sm:w-56 pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <select
              value={historySort}
              onChange={(event) => setHistorySort(event.target.value as typeof historySort)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="late-desc">Late minutes</option>
              <option value="hours-desc">Working hours</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] tracking-wide">
              <tr>
                {['Date', 'Reporting Time', 'Check-In Time', 'Check-Out Time', 'Working Hours', 'Status', 'Late Minutes', 'Remarks'].map((label) => (
                  <th key={label} className="text-left px-4 py-3 font-bold whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedHistoryRows.map((record) => {
                const status = getComputedAttendanceStatus(record, selectedUser, policy);
                const lateMinutes = getDelayMinutes(record, selectedUser, policy);
                return (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{dateLabel(record.date)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDisplayTime(selectedUser.reportingTime)}</td>
                    <td className="px-4 py-3 text-green-700 font-semibold whitespace-nowrap">{formatDisplayTime(record.checkIn)}</td>
                    <td className="px-4 py-3 text-blue-700 font-semibold whitespace-nowrap">{formatDisplayTime(record.checkOut)}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold whitespace-nowrap">{formatHours(getWorkingHours(record))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        status === 'Late' || status === 'Very Late'
                          ? 'bg-orange-100 text-orange-700'
                          : status === 'Absent'
                            ? 'bg-red-100 text-red-700'
                            : status === 'Holiday' || status === 'Weekly Off'
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-green-100 text-green-700'
                      }`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-semibold whitespace-nowrap">{lateMinutes === null ? '-' : `${lateMinutes}m`}</td>
                    <td className="px-4 py-3 text-gray-500 min-w-48">{record.notes ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {historyRows.length === 0 && (
          <div className="p-10 text-center text-gray-400">
            No attendance records found for this filter.
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Page {currentHistoryPage} of {pageCount}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
              disabled={currentHistoryPage <= 1}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => setHistoryPage((page) => Math.min(pageCount, page + 1))}
              disabled={currentHistoryPage >= pageCount}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-green-600" />
            <h3 className="text-gray-900 font-semibold">Monthly Attendance Percentage</h3>
          </div>
          <MiniBarChart data={monthlyTrendData.map((item) => ({ label: item.label, value: item.attendance }))} />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h3 className="text-gray-900 font-semibold">Monthly Working Hours</h3>
          </div>
          <MiniBarChart data={monthlyTrendData.map((item) => ({ label: item.label, value: Math.round(item.hours) }))} color="bg-blue-500" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-orange-600" />
            <h3 className="text-gray-900 font-semibold">Average Hours by Weekday</h3>
          </div>
          <MiniBarChart data={weekdayData} color="bg-orange-500" />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-gray-900 font-semibold">Leave Category Breakdown</h3>
          <div className="mt-4 space-y-3">
            {leaveBreakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-semibold">{item.label}</span>
                  <span className="text-gray-500">{item.value} days</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${item.color}`} style={{ width: `${Math.min(100, percent(item.value, Math.max(1, leavesTaken)))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-gray-900 font-semibold">Upcoming Leave Calendar</h3>
          <div className="mt-4 space-y-3">
            {upcomingLeaves.slice(0, 5).length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming approved leaves.</p>
            ) : upcomingLeaves.slice(0, 5).map((request) => (
              <div key={request.id} className="rounded-xl bg-blue-50 px-3 py-2">
                <p className="text-sm font-semibold text-blue-700">{request.type.toUpperCase()} - {request.totalDays} day(s)</p>
                <p className="text-xs text-blue-600">{dateLabel(request.startDate)} to {dateLabel(request.endDate)}</p>
              </div>
            ))}
          </div>
        </div>
        {canSeeOrg && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-600" />
              <h3 className="text-gray-900 font-semibold">Project-wise Attendance Summary</h3>
            </div>
            <div className="mt-4 space-y-3">
              {projectSummary.map((item) => (
                <div key={item.project} className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 font-semibold">{item.project}</span>
                    <span className="text-green-700 font-bold">{item.percentage}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{item.present}/{item.total} present today - {item.leave} on leave</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {!canSeeOrg && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-900 font-semibold">My Attendance Score</h3>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MetricCard label="Score" value={performanceScore} />
              <MetricCard label="Streak" value={currentStreak(analysisRecords)} tone="blue" />
              <MetricCard label="Late" value={lateRecords.length} tone="orange" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
