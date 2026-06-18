import type {
  AppNotification,
  AttendanceRecord,
  AttendanceStatus,
  Holiday,
  HolidayType,
  LeaveApproval,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  NotificationCategory,
  ReimbursementApproval,
  ReimbursementAttachment,
  ReimbursementCategory,
  ReimbursementPayment,
  ReimbursementRequest,
  ReimbursementStatus,
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
  minor_sick_leave_days?: number | null;
  emergency_leave_days?: number | null;
  casual_leave_days?: number | null;
  annual_leave_days?: number | null;
  paternity_leave_days?: number | null;
  marriage_leave_days?: number | null;
  hajj_leave_days?: number | null;
  umrah_leave_days?: number | null;
  line_manager_id?: string | null;
  project_manager_id?: string | null;
  director_id?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
  include_in_attendance_report?: boolean | null;
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

type DbHolidayRow = {
  id: string;
  holiday_name: string;
  holiday_date: string;
  start_date?: string | null;
  end_date?: string | null;
  recurring?: boolean | null;
  holiday_type?: HolidayType | null;
  description?: string | null;
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

type DbReimbursementCategoryRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

type DbReimbursementAttachmentRow = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_path?: string | null;
  public_url?: string | null;
  created_at: string;
};

type DbReimbursementApprovalRow = {
  approval_level: 1 | 2 | 3;
  approver_id: string;
  approver_role: string;
  status: 'pending' | 'approved' | 'rejected' | 'more_info';
  comment?: string | null;
  acted_at?: string | null;
  approver?: { full_name?: string | null } | null;
};

type DbReimbursementPaymentRow = {
  payment_date?: string | null;
  payment_method?: 'bank_transfer' | 'cash' | 'cheque' | 'other' | null;
  payment_reference?: string | null;
  remarks?: string | null;
  processed_at?: string | null;
  processor?: { full_name?: string | null } | null;
};

type DbReimbursementRow = {
  id: string;
  request_number?: string | null;
  employee_id: string;
  category_id?: string | null;
  expense_date: string;
  amount: number | string;
  currency: string;
  project?: string | null;
  vendor_name?: string | null;
  receipt_number?: string | null;
  description: string;
  status: ReimbursementStatus;
  submitted_at?: string | null;
  created_at: string;
  employee?: {
    full_name?: string | null;
    project?: { name?: string | null } | null;
  } | null;
  category?: { name?: string | null } | null;
  reimbursement_approvals?: DbReimbursementApprovalRow[] | null;
  reimbursement_attachments?: DbReimbursementAttachmentRow[] | null;
  reimbursement_payments?: DbReimbursementPaymentRow[] | null;
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
    reportingTime: formatTime(row.reporting_time) ?? '11:00',
    checkInGraceMinutes: row.check_in_grace_minutes ?? 0,
    checkOutReminderTime: formatTime(row.check_out_reminder_time) ?? '20:00',
    sickLeaveDays: row.sick_leave_days ?? 0,
    minorSickLeaveDays: row.minor_sick_leave_days ?? 12,
    emergencyLeaveDays: row.emergency_leave_days ?? 3,
    casualLeaveDays: row.casual_leave_days ?? 12,
    annualLeaveDays: row.annual_leave_days ?? 10,
    paternityLeaveDays: row.paternity_leave_days ?? 3,
    marriageLeaveDays: row.marriage_leave_days ?? 3,
    hajjLeaveDays: row.hajj_leave_days ?? 40,
    umrahLeaveDays: row.umrah_leave_days ?? 0,
    lineManagerId: row.line_manager_id ?? undefined,
    projectManagerId: row.project_manager_id ?? undefined,
    directorId: row.director_id ?? undefined,
    joinDate: row.joined_at ?? new Date().toISOString().split('T')[0],
    isActive: row.is_active ?? true,
    includeInAttendanceReport: row.include_in_attendance_report ?? true,
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

export function mapHoliday(row: DbHolidayRow): Holiday {
  const startDate = row.start_date ?? row.holiday_date;
  const endDate = row.end_date ?? row.start_date ?? row.holiday_date;

  return {
    id: row.id,
    name: row.holiday_name,
    date: row.holiday_date,
    startDate,
    endDate,
    recurring: row.recurring ?? false,
    type: row.holiday_type ?? 'public',
    description: row.description ?? undefined,
  };
}

export function mapLeaveApproval(row: DbApprovalRow): LeaveApproval {
  const isDirector = row.approver_role.toLowerCase().includes('director');
  return {
    level: isDirector ? 2 : row.approval_level,
    approverId: row.approver_id,
    approverName: row.approver?.full_name ?? (isDirector ? 'Director' : row.approver_role),
    role: isDirector ? 'Director' : row.approver_role,
    status: row.status,
    timestamp: row.acted_at ?? undefined,
    comment: row.comment ?? undefined,
  };
}

function isLegacyProjectManagerApproval(row: DbApprovalRow) {
  return row.approver_role.toLowerCase().includes('project manager');
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
    status: row.status === 'pending_project_manager' ? 'pending_director' : row.status,
    submittedAt: row.submitted_at,
    approvals: (row.approval_workflow ?? [])
      .filter((approval) => !isLegacyProjectManagerApproval(approval))
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

export function mapReimbursementCategory(row: DbReimbursementCategoryRow): ReimbursementCategory {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active ?? true,
  };
}

export function mapReimbursementAttachment(row: DbReimbursementAttachmentRow): ReimbursementAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    url: row.public_url ?? row.file_path ?? '',
    createdAt: row.created_at,
  };
}

export function mapReimbursementApproval(row: DbReimbursementApprovalRow): ReimbursementApproval {
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

export function mapReimbursementPayment(row?: DbReimbursementPaymentRow | null): ReimbursementPayment | undefined {
  if (!row) return undefined;
  return {
    paymentDate: row.payment_date ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    referenceNumber: row.payment_reference ?? undefined,
    remarks: row.remarks ?? undefined,
    processedBy: row.processor?.full_name ?? undefined,
    processedAt: row.processed_at ?? undefined,
  };
}

export function mapReimbursementRequest(row: DbReimbursementRow): ReimbursementRequest {
  return {
    id: row.id,
    requestNumber: row.request_number ?? row.id.slice(0, 8).toUpperCase(),
    userId: row.employee_id,
    userName: row.employee?.full_name ?? 'Unknown User',
    userProject: row.employee?.project?.name ?? 'Unassigned',
    categoryId: row.category_id ?? undefined,
    categoryName: row.category?.name ?? 'Miscellaneous',
    expenseDate: row.expense_date,
    amount: Number(row.amount),
    currency: row.currency,
    project: row.project ?? undefined,
    vendorName: row.vendor_name ?? undefined,
    receiptNumber: row.receipt_number ?? undefined,
    description: row.description,
    status: row.status,
    submittedAt: row.submitted_at ?? undefined,
    createdAt: row.created_at,
    approvals: (row.reimbursement_approvals ?? [])
      .sort((a, b) => a.approval_level - b.approval_level)
      .map(mapReimbursementApproval),
    attachments: (row.reimbursement_attachments ?? []).map(mapReimbursementAttachment),
    payment: mapReimbursementPayment(row.reimbursement_payments?.[0]),
  };
}
