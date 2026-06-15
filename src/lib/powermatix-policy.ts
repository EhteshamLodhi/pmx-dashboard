import type { LeaveType, PolicySettings } from '@/app/types';

export const POWERMATIX_POLICY_EFFECTIVE_DATE = '2026-06-15';
export const DEFAULT_REPORTING_TIME = '11:00';
export const DEFAULT_CLOSING_TIME = '20:00';
export const DEFAULT_CHECK_IN_GRACE_MINUTES = 0;
export const DEFAULT_WEEKLY_OFF_DAYS = ['saturday', 'sunday'];
export const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export const LEAVE_TYPES = [
  'annual',
  'casual',
  'minor_sick',
  'emergency',
  'paternity',
  'marriage',
  'hajj',
  'umrah',
] as const satisfies readonly LeaveType[];

export const DEFAULT_LEAVE_POLICY_NOTES =
  'Policy effective 15 June 2026.\n' +
  'Office timing is 11:00 AM to 8:00 PM. Any check-in after 11:00 AM is late unless approved.\n' +
  'Working week is Monday to Friday. Saturday and Sunday are weekly off by default; Saturday may be revised by management.\n' +
  'Annual leave is 10 working days after 1 continuous year of service and requires 15 working days advance notice.\n' +
  'Casual leave and minor sick leave share a combined 12 working day annual pool, with a 2 day monthly cap unless specially approved.\n' +
  'Emergency, paternity, and marriage leave allow up to 3 working days. Hajj leave allows up to 40 calendar days subject to approval. Umrah leave is case-by-case.\n' +
  'Unused leave lapses at year end and is not encashable.\n' +
  'Leave approval chain is Line Manager -> Director.';

export function defaultPolicySettings(): PolicySettings {
  return {
    policyEffectiveDate: POWERMATIX_POLICY_EFFECTIVE_DATE,
    defaultReportingTime: DEFAULT_REPORTING_TIME,
    checkInGraceMinutes: DEFAULT_CHECK_IN_GRACE_MINUTES,
    globalReportingTime: DEFAULT_REPORTING_TIME,
    globalGracePeriod: DEFAULT_CHECK_IN_GRACE_MINUTES,
    checkOutReminderTime: DEFAULT_CLOSING_TIME,
    closingTime: DEFAULT_CLOSING_TIME,
    workingDays: [...DEFAULT_WORKING_DAYS],
    weeklyOffDays: [...DEFAULT_WEEKLY_OFF_DAYS],
    workWeekEffectiveFrom: POWERMATIX_POLICY_EFFECTIVE_DATE,
    sickLeaveDays: 0,
    minorSickLeaveDays: 12,
    emergencyLeaveDays: 3,
    casualLeaveDays: 12,
    annualLeaveDays: 10,
    paternityLeaveDays: 3,
    marriageLeaveDays: 3,
    hajjLeaveDays: 40,
    umrahLeaveDays: 0,
    casualSickMonthlyCapDays: 2,
    lateConversionCount: 3,
    annualLeaveEligibilityMonths: 12,
    casualLeaveNoticeHours: 0,
    annualLeaveNoticeHours: 15 * 24,
    annualLeaveNoticeWorkingDays: 15,
    leavePolicyNotes: DEFAULT_LEAVE_POLICY_NOTES,
  };
}

export function getLeaveTypeLabel(type: LeaveType) {
  switch (type) {
    case 'annual':
      return 'Annual Leave';
    case 'casual':
      return 'Casual Leave';
    case 'minor_sick':
    case 'sick':
      return 'Minor Sick Leave';
    case 'emergency':
      return 'Emergency Leave';
    case 'paternity':
      return 'Paternity Leave';
    case 'marriage':
      return 'Marriage Leave';
    case 'hajj':
      return 'Hajj Leave';
    case 'umrah':
      return 'Umrah Leave';
  }
}

export function leaveAllowanceForPolicy(policy: PolicySettings, type: LeaveType) {
  switch (type) {
    case 'annual':
      return policy.annualLeaveDays;
    case 'casual':
      return policy.casualLeaveDays;
    case 'minor_sick':
    case 'sick':
      return policy.minorSickLeaveDays || policy.casualLeaveDays;
    case 'emergency':
      return policy.emergencyLeaveDays;
    case 'paternity':
      return policy.paternityLeaveDays;
    case 'marriage':
      return policy.marriageLeaveDays;
    case 'hajj':
      return policy.hajjLeaveDays;
    case 'umrah':
      return policy.umrahLeaveDays;
  }
}
