import type { AttendanceRecord, LeaveRequest, PolicySettings, User } from '@/app/types';
import { defaultPolicySettings } from '@/lib/powermatix-policy';

const CASUAL_SICK_TYPES = new Set(['casual', 'minor_sick', 'sick']);

function yearOf(date = new Date()) {
  return String(date.getFullYear());
}

function monthOf(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function approvedDays(requests: LeaveRequest[], types: Set<string>, year: string, month?: string) {
  return requests
    .filter((request) =>
      request.status === 'approved' &&
      types.has(request.type) &&
      request.startDate.startsWith(year) &&
      (!month || request.startDate.startsWith(month)),
    )
    .reduce((sum, request) => sum + request.totalDays, 0);
}

function completedServiceMonths(joinDate?: string, now = new Date()) {
  if (!joinDate) return 0;
  const joined = new Date(`${joinDate}T00:00:00`);
  if (Number.isNaN(joined.getTime())) return 0;
  let months = (now.getFullYear() - joined.getFullYear()) * 12 + now.getMonth() - joined.getMonth();
  if (now.getDate() < joined.getDate()) months -= 1;
  return Math.max(0, months);
}

export function calculateEmployeePolicyStats(options: {
  user?: User | null;
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  policy?: PolicySettings | null;
  now?: Date;
}) {
  const policy = options.policy ?? defaultPolicySettings();
  const now = options.now ?? new Date();
  const year = yearOf(now);
  const month = monthOf(now);
  const userRecords = options.attendanceRecords.filter((record) => record.userId === options.user?.id);
  const userLeaves = options.leaveRequests.filter((request) => request.userId === options.user?.id);
  const lateConversionCount = Math.max(1, policy.lateConversionCount || 3);
  const annualEligible = completedServiceMonths(options.user?.joinDate, now) >= (policy.annualLeaveEligibilityMonths || 12);

  const totalLateArrivals = userRecords.filter((record) => record.status === 'late').length;
  const lateArrivalsThisYear = userRecords.filter((record) => record.status === 'late' && record.date.startsWith(year)).length;
  const lateArrivalsThisMonth = userRecords.filter((record) => record.status === 'late' && record.date.startsWith(month)).length;
  const casualLeavesDeductedDueToLate = Math.floor(lateArrivalsThisYear / lateConversionCount);
  const remainingLateBeforeNextDeduction = lateArrivalsThisYear % lateConversionCount;

  const annualEntitlement = options.user?.annualLeaveDays ?? policy.annualLeaveDays;
  const casualSickEntitlement = options.user?.casualLeaveDays ?? policy.casualLeaveDays;
  const emergencyEntitlement = options.user?.emergencyLeaveDays ?? policy.emergencyLeaveDays;
  const marriageEntitlement = options.user?.marriageLeaveDays ?? policy.marriageLeaveDays;
  const paternityEntitlement = options.user?.paternityLeaveDays ?? policy.paternityLeaveDays;
  const hajjEntitlement = options.user?.hajjLeaveDays ?? policy.hajjLeaveDays;

  const usedAnnual = approvedDays(userLeaves, new Set(['annual']), year);
  const usedCasualSick = approvedDays(userLeaves, CASUAL_SICK_TYPES, year);
  const usedCasualSickThisMonth = approvedDays(userLeaves, CASUAL_SICK_TYPES, year, month);
  const usedEmergency = approvedDays(userLeaves, new Set(['emergency']), year);
  const usedMarriage = approvedDays(userLeaves, new Set(['marriage']), year);
  const usedPaternity = approvedDays(userLeaves, new Set(['paternity']), year);
  const usedHajj = approvedDays(userLeaves, new Set(['hajj']), year);

  const casualSickUsedWithLate = usedCasualSick + casualLeavesDeductedDueToLate;
  const pendingPayrollDeductions = Math.max(0, casualSickUsedWithLate - casualSickEntitlement);
  const combinedCasualSickRemaining = Math.max(0, casualSickEntitlement - casualSickUsedWithLate);

  return {
    year,
    month,
    totalLateArrivals,
    lateArrivalsThisMonth,
    lateArrivalsThisYear,
    casualLeavesDeductedDueToLate,
    remainingLateBeforeNextDeduction,
    pendingPayrollDeductions,
    payrollDeductionRequired: pendingPayrollDeductions > 0,
    leave: {
      annual: {
        total: annualEntitlement,
        used: usedAnnual,
        remaining: annualEligible ? Math.max(0, annualEntitlement - usedAnnual) : 0,
        eligible: annualEligible,
      },
      casual: {
        total: casualSickEntitlement,
        used: casualSickUsedWithLate,
        usedThisMonth: usedCasualSickThisMonth,
        remaining: combinedCasualSickRemaining,
      },
      sick: {
        total: casualSickEntitlement,
        used: casualSickUsedWithLate,
        usedThisMonth: usedCasualSickThisMonth,
        remaining: combinedCasualSickRemaining,
      },
      emergency: {
        total: emergencyEntitlement,
        used: usedEmergency,
        remaining: Math.max(0, emergencyEntitlement - usedEmergency),
      },
      marriage: {
        total: marriageEntitlement,
        used: usedMarriage,
        remaining: Math.max(0, marriageEntitlement - usedMarriage),
      },
      paternity: {
        total: paternityEntitlement,
        used: usedPaternity,
        remaining: Math.max(0, paternityEntitlement - usedPaternity),
      },
      hajj: {
        total: hajjEntitlement,
        used: usedHajj,
        remaining: Math.max(0, hajjEntitlement - usedHajj),
      },
    },
  };
}
