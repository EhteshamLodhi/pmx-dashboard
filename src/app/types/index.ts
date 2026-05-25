export type UserRole = 'employee' | 'manager' | 'director' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  project?: string;
  position: string;
  reportingTime?: string;
  checkInGraceMinutes?: number;
  checkOutReminderTime?: string;
  sickLeaveDays?: number;
  emergencyLeaveDays?: number;
  casualLeaveDays?: number;
  annualLeaveDays?: number;
  lineManagerId?: string;
  projectManagerId?: string;
  directorId?: string;
  joinDate: string;
  isActive: boolean;
  phone?: string;
}

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'checked-in-only'
  | 'half-day'
  | 'on-leave'
  | 'holiday'
  | 'weekly-off';

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  totalHours?: number;
  status: AttendanceStatus;
  notes?: string;
  editedBy?: string;
  editedAt?: string;
}

export type HolidayType = 'public' | 'company' | 'optional';

export interface Holiday {
  id: string;
  name: string;
  date: string;
  startDate: string;
  endDate: string;
  recurring: boolean;
  type: HolidayType;
  description?: string;
}

export type LeaveType = 'sick' | 'emergency' | 'casual' | 'annual';
export type LeaveStatus = 'pending_manager' | 'pending_project_manager' | 'pending_director' | 'approved' | 'rejected';

export interface LeaveApproval {
  level: 1 | 2 | 3;
  approverId: string;
  approverName: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp?: string;
  comment?: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  userProject: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  approvals: LeaveApproval[];
}

export type NotificationCategory = 'attendance' | 'leave' | 'approval' | 'admin';

export interface AppNotification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PolicySettings {
  defaultReportingTime: string;
  checkInGraceMinutes: number;
  globalReportingTime: string;
  globalGracePeriod: number;
  checkOutReminderTime: string;
  workingDays: string[];
  weeklyOffDays: string[];
  workWeekEffectiveFrom: string;
  sickLeaveDays: number;
  emergencyLeaveDays: number;
  casualLeaveDays: number;
  annualLeaveDays: number;
  casualLeaveNoticeHours: number;
  annualLeaveNoticeHours: number;
  leavePolicyNotes: string;
}
