import type {
  AppNotification,
  AttendanceRecord,
  AttendanceStatus,
  LeaveApproval,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  NotificationCategory,
  User,
  UserRole,
} from '@/app/types';

type Nullable<T> = T | null;

type DbUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  project_id?: string | null;
  reporting_time?: string | null;
  check_in_grace_minutes?: number | null;
  check_out_reminder_time?: string | null;
  sick_leave_days?: number | null;
  emergency_leave_days?: number | null;
  casual_leave_days?: number | null;
  annual_leave_days?: number | null;
  line_manager_id?: string | null;
  project_manager_id?: string | null;
  director_id?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
  joined_at?: string | null;
  project?: { name?: string | null } | null;
};

type DbAttendanceRow = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  total_hours?: number | null;
  status: AttendanceStatus;
  remarks?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
  editor?: { full_name?: string | null } | null;
};

type DbApprovalRow = {
  approval_level: 1 | 2 | 3;
  approver_id: string;
  approver_role: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string | null;
  acted_at?: string | null;
  approver?: { full_name?: string | null } | null;
};

type DbLeaveRow = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: LeaveStatus;
  submitted_at: string;
  employee?: {
    full_name?: string | null;
    project?: { name?: string | null } | null;
  } | null;
  approval_workflow?: DbApprovalRow[] | null;
};

type DbNotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string | null;
  is_read?: boolean | null;
  created_at: string;
};

function formatTime(value?: Nullable<string>) {
  if (!value) return undefined;
  if (value.includes('T')) {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  }
  return value.slice(0, 5);
}

export function mapUser(row: DbUserRow): User {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    project: row.project?.name ?? row.project_id ?? 'Unassigned',
    position:
      row.role === 'admin'
        ? 'System Administrator'
        : row.role === 'director'
          ? 'Director'
          : row.role === 'manager'
            ? 'Manager'
            : 'Employee',
    reportingTime: formatTime(row.reporting_time) ?? '09:00',
    checkInGraceMinutes: row.check_in_grace_minutes ?? 15,
    checkOutReminderTime: formatTime(row.check_out_reminder_time) ?? '19:00',
    sickLeaveDays: row.sick_leave_days ?? 10,
    emergencyLeaveDays: row.emergency_leave_days ?? 5,
    casualLeaveDays: row.casual_leave_days ?? 10,
    annualLeaveDays: row.annual_leave_days ?? 14,
    lineManagerId: row.line_manager_id ?? undefined,
    projectManagerId: row.project_manager_id ?? undefined,
    directorId: row.director_id ?? undefined,
    joinDate: row.joined_at ?? new Date().toISOString().split('T')[0],
    isActive: row.is_active ?? true,
    phone: row.phone ?? undefined,
  };
}

export function mapAttendanceRecord(row: DbAttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    userId: row.employee_id,
    date: row.work_date,
    checkIn: formatTime(row.check_in_at),
    checkOut: formatTime(row.check_out_at),
    totalHours: row.total_hours ?? undefined,
    status: row.status,
    notes: row.remarks ?? undefined,
    editedBy: row.editor?.full_name ?? row.edited_by ?? undefined,
    editedAt: row.edited_at ?? undefined,
  };
}

export function mapLeaveApproval(row: DbApprovalRow): LeaveApproval {
  return {
    level: row.approval_level,
    approverId: row.approver_id,
    approverName: row.approver?.full_name ?? row.approver_role,
    role: row.approver_role,
    status: row.status,
    timestamp: row.acted_at ?? undefined,
    comment: row.comment ?? undefined,
  };
}

export function mapLeaveRequest(row: DbLeaveRow): LeaveRequest {
  return {
    id: row.id,
    userId: row.employee_id,
    userName: row.employee?.full_name ?? 'Unknown User',
    userProject: row.employee?.project?.name ?? 'Unassigned',
    type: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    totalDays: row.total_days,
    reason: row.reason,
    status: row.status,
    submittedAt: row.submitted_at,
    approvals: (row.approval_workflow ?? [])
      .sort((a, b) => a.approval_level - b.approval_level)
      .map(mapLeaveApproval),
  };
}

export function mapNotification(row: DbNotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    title: row.title,
    message: row.message,
    link: row.link ?? undefined,
    isRead: row.is_read ?? false,
    createdAt: row.created_at,
  };
}
