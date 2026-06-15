import type { AttendanceRecord, AttendanceStatus, User } from '@/app/types';

export function calculateHours(checkIn?: string, checkOut?: string) {
  if (!checkIn || !checkOut) return undefined;
  const [inHours, inMinutes] = checkIn.split(':').map(Number);
  const [outHours, outMinutes] = checkOut.split(':').map(Number);
  const minutes = outHours * 60 + outMinutes - (inHours * 60 + inMinutes);
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : undefined;
}

export function resolveAttendanceStatus(user: User, record?: Pick<AttendanceRecord, 'checkIn' | 'checkOut' | 'status'>): AttendanceStatus {
  if (!record?.checkIn) return record?.status ?? 'absent';
  if (!record.checkOut) return record.checkIn > (user.reportingTime ?? '11:00') ? 'late' : 'checked-in-only';
  return record.checkIn > (user.reportingTime ?? '11:00') ? 'late' : 'present';
}
