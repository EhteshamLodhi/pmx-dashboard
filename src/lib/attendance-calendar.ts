import type { Holiday, LeaveRequest, PolicySettings } from '@/app/types';

export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];
export type NonWorkingStatus = 'holiday' | 'weekly-off' | 'on-leave';

const DAY_LABELS: Record<WeekDay, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const JS_DAY_TO_WEEK_DAY: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function weekdayLabel(day: string) {
  return DAY_LABELS[normalizeWeekday(day) ?? 'monday'];
}

export function normalizeWeekday(value?: string | null): WeekDay | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return WEEK_DAYS.find((day) => day === normalized) ?? null;
}

export function normalizeWeekdays(values?: unknown, fallback: WeekDay[] = []) {
  if (!Array.isArray(values)) return fallback;
  const normalized = values
    .map((value) => normalizeWeekday(String(value)))
    .filter((value): value is WeekDay => Boolean(value));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

export function dayNameForDate(date: string): WeekDay {
  const [year, month, day] = date.split('-').map(Number);
  return JS_DAY_TO_WEEK_DAY[new Date(year, month - 1, day).getDay()];
}

export function holidayForDate(holidays: Holiday[], date: string) {
  const monthDay = date.slice(5);
  return holidays.find((holiday) => holiday.date === date || (holiday.recurring && holiday.date.slice(5) === monthDay));
}

export function isWeeklyOff(date: string, policy?: PolicySettings | null) {
  const weeklyOffDays = normalizeWeekdays(policy?.weeklyOffDays, ['saturday', 'sunday']);
  return weeklyOffDays.includes(dayNameForDate(date));
}

export function approvedLeaveForDate(leaveRequests: LeaveRequest[], userId: string, date: string) {
  return leaveRequests.find(
    (request) =>
      request.userId === userId &&
      request.status === 'approved' &&
      request.startDate <= date &&
      request.endDate >= date,
  );
}

export function getNonWorkingStatus(options: {
  date: string;
  userId?: string;
  holidays?: Holiday[];
  policy?: PolicySettings | null;
  leaveRequests?: LeaveRequest[];
}): NonWorkingStatus | null {
  if (holidayForDate(options.holidays ?? [], options.date)) return 'holiday';
  if (isWeeklyOff(options.date, options.policy)) return 'weekly-off';
  if (options.userId && approvedLeaveForDate(options.leaveRequests ?? [], options.userId, options.date)) return 'on-leave';
  return null;
}

export function nonWorkingLabel(status: NonWorkingStatus) {
  if (status === 'holiday') return 'Holiday';
  if (status === 'weekly-off') return 'Weekly Off';
  return 'On Leave';
}
