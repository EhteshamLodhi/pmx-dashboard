import type { AttendanceRecord, PolicySettings, User } from '@/app/types';

export type AttendanceRangeKey = 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type ComputedAttendanceStatus =
  | 'On Time'
  | 'Late'
  | 'Very Late'
  | 'Half Day'
  | 'Missing Checkout'
  | 'Absent'
  | 'Leave Approved';

export function minutesFromTime(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function timeFromMinutes(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return `${Math.floor(value)}h ${Math.round((value % 1) * 60)}m`;
}

export function getWorkingHours(record?: AttendanceRecord) {
  if (!record) return 0;
  if (typeof record.totalHours === 'number') return record.totalHours;
  const checkIn = minutesFromTime(record.checkIn);
  const checkOut = minutesFromTime(record.checkOut);
  if (checkIn === null || checkOut === null || checkOut <= checkIn) return 0;
  return Number(((checkOut - checkIn) / 60).toFixed(2));
}

export function resolveReportingPolicy(user?: User, policy?: PolicySettings | null) {
  return {
    reportingTime: user?.reportingTime || policy?.globalReportingTime || '09:00',
    graceMinutes: user?.checkInGraceMinutes ?? policy?.globalGracePeriod ?? 15,
  };
}

export function getDelayMinutes(record?: AttendanceRecord, user?: User, policy?: PolicySettings | null) {
  const checkIn = minutesFromTime(record?.checkIn);
  if (checkIn === null) return null;
  const { reportingTime, graceMinutes } = resolveReportingPolicy(user, policy);
  const reporting = minutesFromTime(reportingTime) ?? 9 * 60;
  return Math.max(0, checkIn - reporting - graceMinutes);
}

export function getComputedAttendanceStatus(record?: AttendanceRecord, user?: User, policy?: PolicySettings | null): ComputedAttendanceStatus {
  if (!record || record.status === 'absent') return 'Absent';
  if (record.status === 'on-leave') return 'Leave Approved';
  if (record.checkIn && !record.checkOut) return 'Missing Checkout';

  const hours = getWorkingHours(record);
  if (hours > 0 && hours < 4) return 'Half Day';

  const delay = getDelayMinutes(record, user, policy) ?? 0;
  if (delay > 60) return 'Very Late';
  if (delay > 0 || record.status === 'late') return 'Late';
  return 'On Time';
}

export function averageTime(records: AttendanceRecord[], key: 'checkIn' | 'checkOut') {
  const minutes = records.map((record) => minutesFromTime(record[key])).filter((value): value is number => value !== null);
  if (minutes.length === 0) return undefined;
  return timeFromMinutes(minutes.reduce((sum, value) => sum + value, 0) / minutes.length);
}

export function getRangeBounds(range: AttendanceRangeKey, customStart?: string, customEnd?: string, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);

  if (range === 'week') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  } else if (range === 'month') {
    start.setDate(1);
  } else if (range === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  } else if (range === 'year') {
    start.setMonth(0, 1);
  } else {
    return {
      start: customStart || toIsoDate(start),
      end: customEnd || toIsoDate(end),
    };
  }

  start.setHours(0, 0, 0, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function filterRecordsByRange(records: AttendanceRecord[], range: AttendanceRangeKey, customStart?: string, customEnd?: string) {
  const { start, end } = getRangeBounds(range, customStart, customEnd);
  return records.filter((record) => record.date >= start && record.date <= end);
}

export function getPerformanceScore(records: AttendanceRecord[], user: User, policy?: PolicySettings | null) {
  if (records.length === 0) return 0;

  return records.reduce((score, record) => {
    const status = getComputedAttendanceStatus(record, user, policy);
    const hours = getWorkingHours(record);

    if (status === 'Absent') return score - 10;

    let nextScore = score + (status === 'On Time' ? 10 : -5);
    nextScore += 10;
    nextScore += hours >= 8 ? 10 : -5;
    return nextScore;
  }, 0);
}

function toIsoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
