'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification, AttendanceRecord, AttendanceStatus, Holiday, LeaveRequest, LeaveType, User } from '../types';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { mapAttendanceRecord, mapHoliday, mapLeaveRequest, mapNotification, mapUser } from '@/lib/supabase/mappers';

interface AppContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  currentUser: User | null;
  users: User[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  notifications: AppNotification[];
  unreadNotifications: number;
  pushNotificationsEnabled: boolean;
  pushNotificationsSupported: boolean;
  logout: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  enablePushNotifications: () => Promise<string>;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
  submitLeaveRequest: (data: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
  }) => Promise<void>;
  deleteLeaveRequest: (leaveId: string) => Promise<void>;
  approveLeave: (leaveId: string, level: 1 | 2 | 3, approved: boolean, comment: string) => Promise<void>;
  updateAttendanceRecord: (id: string, updates: Partial<AttendanceRecord>) => Promise<void>;
  addAttendanceRecord: (record: Omit<AttendanceRecord, 'id'>) => Promise<void>;
  updateUserHierarchy: (userId: string, updates: { lineManagerId?: string; projectManagerId?: string; directorId?: string }) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'joinDate' | 'isActive' | 'position'> & { position?: string }) => Promise<void>;
  getTodayRecord: (userId?: string) => AttendanceRecord | undefined;
  getAttendanceForUser: (userId: string) => AttendanceRecord[];
  refreshData: (options?: { showLoading?: boolean }) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

function getTodayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toTimeString(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function getTotalHours(checkIn?: string, checkOut?: string) {
  if (!checkIn || !checkOut) return undefined;

  const [hoursIn, minutesIn] = checkIn.split(':').map(Number);
  const [hoursOut, minutesOut] = checkOut.split(':').map(Number);
  const totalMinutes = hoursOut * 60 + minutesOut - (hoursIn * 60 + minutesIn);

  return totalMinutes > 0 ? Math.round((totalMinutes / 60) * 100) / 100 : undefined;
}

function getLeaveDays(startDate: string, endDate: string) {
  return Math.floor((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    if (body?.error) return body.error as string;
  } catch {
    // Ignore JSON parse failures and fall back to generic text.
  }

  return response.statusText || 'Request failed.';
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function uint8ArrayToUrlBase64(value: ArrayBuffer | null) {
  if (!value) return null;
  const bytes = new Uint8Array(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const exists = items.some((candidate) => candidate.id === item.id);
  return exists ? items.map((candidate) => (candidate.id === item.id ? item : candidate)) : [item, ...items];
}

function notificationVibration(category: AppNotification['category']) {
  if (category === 'approval') return [300, 120, 300, 120, 600];
  if (category === 'attendance') return [250, 100, 250, 100, 250];
  return [200, 100, 200, 100, 400];
}

function applyRolePosition(user: User): User {
  return {
    ...user,
    position:
      user.role === 'admin'
        ? 'System Administrator'
        : user.role === 'director'
          ? 'Director'
          : user.role === 'manager'
            ? 'Manager'
            : 'Employee',
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const deliveredNotificationIds = useRef<Set<string>>(new Set());

  const supabaseEnabled = isSupabaseConfigured();
  const today = useMemo(() => getTodayIsoDate(), []);
  const pushNotificationsSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const bootstrapProfile = useCallback(async () => {
    const response = await fetch('/api/profile/bootstrap', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }
  }, []);

  const fetchCurrentProfile = useCallback(async () => {
    const response = await fetch('/api/profile', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    const body = (await response.json()) as { data?: unknown };
    return body.data ? mapUser(body.data as Parameters<typeof mapUser>[0]) : null;
  }, []);

  const syncSession = useCallback(
    async (supabase: SupabaseClient, session: Session | null, options: { showLoading?: boolean } = {}) => {
      if (!session?.user) {
        setCurrentUser(null);
        setUsers([]);
        setAttendanceRecords([]);
        setLeaveRequests([]);
        setHolidays([]);
        setNotifications([]);
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }

      if (options.showLoading) {
        setIsLoading(true);
      }

      try {
        await bootstrapProfile();
        const me = await fetchCurrentProfile();

        const [usersResult, attendanceResult, leaveResult, holidayResult, notificationResult] = await Promise.allSettled([
          supabase
            .from('users')
            .select('*, project:project_id(name)')
            .order('full_name'),
          supabase
            .from('attendance_logs')
            .select('*, editor:edited_by(full_name)')
            .order('work_date', { ascending: false }),
          supabase
            .from('leave_requests')
            .select(`
              *,
              employee:employee_id(full_name, project:project_id(name)),
              approval_workflow(
                approval_level,
                approver_id,
                approver_role,
                status,
                comment,
                acted_at,
                approver:approver_id(full_name)
              )
            `)
            .order('submitted_at', { ascending: false }),
          supabase
            .from('holidays')
            .select('*')
            .order('start_date', { ascending: true }),
          supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50),
        ]);

        const usersData = usersResult.status === 'fulfilled' ? usersResult.value.data ?? [] : [];
        const usersError = usersResult.status === 'fulfilled' ? usersResult.value.error : usersResult.reason;
        const attendanceData = attendanceResult.status === 'fulfilled' ? attendanceResult.value.data ?? [] : [];
        const attendanceError = attendanceResult.status === 'fulfilled' ? attendanceResult.value.error : attendanceResult.reason;
        const leaveData = leaveResult.status === 'fulfilled' ? leaveResult.value.data ?? [] : [];
        const leaveError = leaveResult.status === 'fulfilled' ? leaveResult.value.error : leaveResult.reason;
        const holidayData = holidayResult.status === 'fulfilled' ? holidayResult.value.data ?? [] : [];
        const holidayError = holidayResult.status === 'fulfilled' ? holidayResult.value.error : holidayResult.reason;
        const notificationData = notificationResult.status === 'fulfilled' ? notificationResult.value.data ?? [] : [];
        const notificationError =
          notificationResult.status === 'fulfilled' ? notificationResult.value.error : notificationResult.reason;

        if (usersError) {
          console.error('Users query failed during session sync', usersError);
        }
        if (attendanceError) {
          console.error('Attendance query failed during session sync', attendanceError);
        }
        if (leaveError) {
          console.error('Leave query failed during session sync', leaveError);
        }
        if (holidayError) {
          console.error('Holiday query failed during session sync', holidayError);
        }
        if (notificationError) {
          console.error('Notification query failed during session sync', notificationError);
        }

        const mappedUsers = (usersData as Parameters<typeof mapUser>[0][]).map(mapUser);
        const mappedAttendance = (attendanceData as Parameters<typeof mapAttendanceRecord>[0][]).map(mapAttendanceRecord);
        const mappedLeaves = (leaveData as Parameters<typeof mapLeaveRequest>[0][]).map(mapLeaveRequest);
        const mappedHolidays = (holidayData as Parameters<typeof mapHoliday>[0][]).map(mapHoliday);
        const mappedNotifications = (notificationData as Parameters<typeof mapNotification>[0][]).map(mapNotification);
        const resolvedCurrentUser = me ?? mappedUsers.find((item) => item.id === session.user.id) ?? null;
        const resolvedUsers =
          resolvedCurrentUser && !mappedUsers.some((item) => item.id === resolvedCurrentUser.id)
            ? [resolvedCurrentUser, ...mappedUsers]
            : mappedUsers;

        setUsers(resolvedUsers);
        setAttendanceRecords(mappedAttendance);
        setLeaveRequests(mappedLeaves);
        setHolidays(mappedHolidays);
        setNotifications(mappedNotifications);
        setCurrentUser(resolvedCurrentUser);
        setIsLoggedIn(Boolean(resolvedCurrentUser));
      } catch (error) {
        console.error('Supabase session sync failed', error);
        setUsers([]);
        setAttendanceRecords([]);
        setLeaveRequests([]);
        setHolidays([]);
        setNotifications([]);
        setCurrentUser(null);
        setIsLoggedIn(false);
      } finally {
        if (options.showLoading) {
          setIsLoading(false);
        }
      }
    },
    [bootstrapProfile, fetchCurrentProfile],
  );

  const refreshData = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const supabase = createClient();
    if (!supabase) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    await syncSession(supabase, session, options);
  }, [syncSession]);

  const refreshPushStatus = useCallback(async () => {
    if (!pushNotificationsSupported) {
      setPushNotificationsEnabled(false);
      return;
    }

    if (Notification.permission !== 'granted') {
      setPushNotificationsEnabled(false);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const existingKey = uint8ArrayToUrlBase64(existingSubscription?.options.applicationServerKey ?? null);
    setPushNotificationsEnabled(Boolean(existingSubscription) && Boolean(publicKey) && existingKey === publicKey);
  }, [pushNotificationsSupported]);

  const showLocalSystemNotification = useCallback(
    async (notification: AppNotification) => {
      if (!pushNotificationsSupported || !pushNotificationsEnabled) return;
      if (Notification.permission !== 'granted') return;
      if (deliveredNotificationIds.current.has(notification.id)) return;

      deliveredNotificationIds.current.add(notification.id);

      try {
        const registration = await navigator.serviceWorker.ready;
        const options = {
          body: notification.message,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: notification.id,
          requireInteraction: notification.category === 'approval' || notification.category === 'attendance',
          vibrate: notificationVibration(notification.category),
          data: {
            link: notification.link ?? '/dashboard',
          },
        } as NotificationOptions & { vibrate?: number[] };

        await registration.showNotification(notification.title, options);
      } catch (error) {
        console.error('Unable to show local system notification', error);
        deliveredNotificationIds.current.delete(notification.id);
      }
    },
    [pushNotificationsEnabled, pushNotificationsSupported],
  );

  useEffect(() => {
    const supabase = createClient();

    if (!supabaseEnabled || !supabase) {
      setCurrentUser(null);
      setUsers([]);
      setAttendanceRecords([]);
      setLeaveRequests([]);
      setNotifications([]);
      setIsLoggedIn(false);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      await syncSession(supabase, session, { showLoading: true });
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(supabase, session, { showLoading: !session });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseEnabled, syncSession]);

  useEffect(() => {
    void refreshPushStatus();
  }, [refreshPushStatus]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !currentUser) return;

    const channel = supabase
      .channel(`notifications:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const nextNotification = mapNotification(payload.new as Parameters<typeof mapNotification>[0]);
            setNotifications((items) => upsertById(items, nextNotification));
            void showLocalSystemNotification(nextNotification);
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setNotifications((items) =>
              items.map((item) =>
                item.id === (payload.new as { id?: string }).id
                  ? mapNotification(payload.new as Parameters<typeof mapNotification>[0])
                  : item,
              ),
            );
            return;
          }

          if (payload.eventType === 'DELETE') {
            setNotifications((items) => items.filter((item) => item.id !== (payload.old as { id?: string }).id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser, showLocalSystemNotification]);

  const getTodayRecord = useCallback(
    (userId?: string) => {
      const targetUserId = userId ?? currentUser?.id;
      return attendanceRecords.find((record) => record.userId === targetUserId && record.date === today);
    },
    [attendanceRecords, currentUser?.id, today],
  );

  const getAttendanceForUser = useCallback(
    (userId: string) => attendanceRecords.filter((record) => record.userId === userId),
    [attendanceRecords],
  );

  const getAttendanceStatus = useCallback((user: User, checkInTime: string): AttendanceStatus => {
    const reportingTime = user.reportingTime ?? '09:00';
    const graceMinutes = user.checkInGraceMinutes ?? 15;
    const [reportingHours, reportingMinutes] = reportingTime.split(':').map(Number);
    const [checkInHours, checkInMinutes] = checkInTime.split(':').map(Number);
    return checkInHours * 60 + checkInMinutes > reportingHours * 60 + reportingMinutes + graceMinutes
      ? 'late'
      : 'checked-in-only';
  }, []);

  const logout = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  }, []);

  const markNotificationRead = useCallback(
    async (id: string) => {
      const previous = notifications;
      setNotifications((items) => items.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification)));

      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setNotifications(previous);
        throw new Error(await parseApiError(response));
      }
    },
    [notifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    const previous = notifications;
    setNotifications((items) => items.map((notification) => ({ ...notification, isRead: true })));

    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ markAllRead: true }),
    });

    if (!response.ok) {
      setNotifications(previous);
      throw new Error(await parseApiError(response));
    }
  }, [notifications]);

  const enablePushNotifications = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications are not supported on this device.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted.');
    }

    const registration = await navigator.serviceWorker.ready;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      throw new Error('Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to enable browser push subscriptions.');
    }

    const existingSubscription = await registration.pushManager.getSubscription();
    const existingKey = uint8ArrayToUrlBase64(existingSubscription?.options.applicationServerKey ?? null);

    if (existingSubscription && existingKey !== publicKey) {
      try {
        await existingSubscription.unsubscribe();
      } catch (error) {
        console.warn('Unable to remove outdated push subscription', error);
      }
    }

    const currentSubscription = await registration.pushManager.getSubscription();
    const subscription =
      currentSubscription ??
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

    if (!subscription) {
      throw new Error('Unable to create a browser push subscription for this device.');
    }

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subscription),
    });

    if (!response.ok) throw new Error(await parseApiError(response));

    try {
      await registration.showNotification('PowerMatix browser notifications are enabled', {
        body: 'This confirms your browser can display notifications from the app.',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: `push-local-test:${Date.now()}`,
        data: { link: '/dashboard' },
      });
    } catch (error) {
      console.error('Local browser notification test failed', error);
    }

    const testResponse = await fetch('/api/push-subscriptions/test', {
      method: 'POST',
      credentials: 'include',
    });

    if (!testResponse.ok) {
      console.warn('Push test request did not complete successfully', await parseApiError(testResponse));
      await refreshPushStatus();
      return 'Push is enabled on this device, but the server test request did not complete.';
    }

    const testBody = (await testResponse.json()) as {
      delivery?: {
        configured?: boolean;
        attempted?: number;
        sent?: number;
        failed?: number;
      };
    };

    await refreshPushStatus();
    if (!testBody.delivery?.configured) {
      return 'Push is enabled locally, but VAPID server keys are missing in this deployment.';
    }

    if (!testBody.delivery.attempted) {
      return 'Push is enabled locally, but no server subscription was found for this account.';
    }

    if (!testBody.delivery.sent) {
      return 'Push is enabled locally, but the browser push service rejected the server test.';
    }

    return `Push is enabled on this device. Server test sent to ${testBody.delivery.sent} subscription(s).`;
  }, [refreshPushStatus]);

  const checkIn = useCallback(async () => {
    if (!currentUser) throw new Error('No active user session found.');

    const previous = attendanceRecords;
    const optimisticRecord: AttendanceRecord = {
      id: `optimistic-check-in-${currentUser.id}-${today}`,
      userId: currentUser.id,
      date: today,
      checkIn: toTimeString(new Date()),
      status: getAttendanceStatus(currentUser, toTimeString(new Date())),
    };

    setAttendanceRecords((records) => [
      optimisticRecord,
      ...records.filter((record) => !(record.userId === currentUser.id && record.date === today)),
    ]);

    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'check-in' }),
    });

    if (!response.ok) {
      setAttendanceRecords(previous);
      throw new Error(await parseApiError(response));
    }

    const body = (await response.json()) as { data?: Parameters<typeof mapAttendanceRecord>[0] };
    if (body.data) {
      const serverRecord = mapAttendanceRecord(body.data);
      setAttendanceRecords((records) => upsertById(records.filter((record) => record.id !== optimisticRecord.id), serverRecord));
    }

    void refreshData();
  }, [attendanceRecords, currentUser, getAttendanceStatus, refreshData, today]);

  const checkOut = useCallback(async () => {
    if (!currentUser) throw new Error('No active user session found.');

    const previous = attendanceRecords;
    const existing = getTodayRecord(currentUser.id);
    if (existing) {
      const checkOut = toTimeString(new Date());
      setAttendanceRecords((records) =>
        records.map((record) =>
          record.id === existing.id
            ? {
                ...record,
                checkOut,
                totalHours: getTotalHours(record.checkIn, checkOut),
                status: record.status === 'late' ? 'late' : 'present',
              }
            : record,
        ),
      );
    }

    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'check-out' }),
    });

    if (!response.ok) {
      setAttendanceRecords(previous);
      throw new Error(await parseApiError(response));
    }

    const body = (await response.json()) as { data?: Parameters<typeof mapAttendanceRecord>[0] };
    if (body.data) {
      setAttendanceRecords((records) => upsertById(records, mapAttendanceRecord(body.data!)));
    }

    void refreshData();
  }, [attendanceRecords, currentUser, getTodayRecord, refreshData]);

  const submitLeaveRequest = useCallback(
    async (data: { type: LeaveType; startDate: string; endDate: string; reason: string }) => {
      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const body = (await response.json()) as { data?: { id: string; submitted_at?: string } };
      if (body.data && currentUser) {
        const manager = users.find((user) => user.id === currentUser.lineManagerId);
        const projectManager = users.find((user) => user.id === currentUser.projectManagerId);
        const director = users.find((user) => user.id === currentUser.directorId);
        const optimisticLeave: LeaveRequest = {
          id: body.data.id,
          userId: currentUser.id,
          userName: currentUser.name,
          userProject: currentUser.project ?? 'Unassigned',
          type: data.type,
          startDate: data.startDate,
          endDate: data.endDate,
          totalDays: getLeaveDays(data.startDate, data.endDate),
          reason: data.reason,
          status: 'pending_manager',
          submittedAt: body.data.submitted_at ?? new Date().toISOString(),
          approvals: [
            {
              level: 1,
              approverId: currentUser.lineManagerId ?? '',
              approverName: manager?.name ?? 'Line Manager',
              role: 'Line Manager',
              status: 'pending',
            },
            {
              level: 2,
              approverId: currentUser.projectManagerId ?? '',
              approverName: projectManager?.name ?? 'Project Manager',
              role: 'Project Manager',
              status: 'pending',
            },
            {
              level: 3,
              approverId: currentUser.directorId ?? '',
              approverName: director?.name ?? 'Director',
              role: 'Director',
              status: 'pending',
            },
          ],
        };
        setLeaveRequests((requests) => upsertById(requests, optimisticLeave));
      }

      void refreshData();
    },
    [currentUser, refreshData, users],
  );

  const deleteLeaveRequest = useCallback(
    async (leaveId: string) => {
      const previous = leaveRequests;
      setLeaveRequests((requests) => requests.filter((request) => request.id !== leaveId));

      const response = await fetch(`/api/leave-requests?leaveId=${encodeURIComponent(leaveId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setLeaveRequests(previous);
        throw new Error(await parseApiError(response));
      }

      void refreshData();
    },
    [leaveRequests, refreshData],
  );

  const approveLeave = useCallback(
    async (leaveId: string, level: 1 | 2 | 3, approved: boolean, comment: string) => {
      const response = await fetch('/api/leave-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          leaveId,
          level,
          approved,
          comment,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const actedAt = new Date().toISOString();
      setLeaveRequests((requests) =>
        requests.map((request) => {
          if (request.id !== leaveId) return request;
          return {
            ...request,
            status: approved
              ? level === 1
                ? 'pending_project_manager'
                : level === 2
                  ? 'pending_director'
                  : 'approved'
              : 'rejected',
            approvals: request.approvals.map((approval) =>
              approval.level === level
                ? {
                    ...approval,
                    status: approved ? 'approved' : 'rejected',
                    comment: comment.trim() || undefined,
                    timestamp: actedAt,
                  }
                : approval,
            ),
          };
        }),
      );
      void refreshData();
    },
    [refreshData],
  );

  const updateAttendanceRecord = useCallback(
    async (id: string, updates: Partial<AttendanceRecord>) => {
      if (!currentUser) throw new Error('No active user session found.');

      const supabase = createClient();
      if (!supabase) throw new Error('Supabase is not configured.');

      const workDate = updates.date ?? today;
      const payload = {
        id,
        work_date: workDate,
        check_in_at: updates.checkIn ? new Date(`${workDate}T${updates.checkIn}:00`).toISOString() : null,
        check_out_at: updates.checkOut ? new Date(`${workDate}T${updates.checkOut}:00`).toISOString() : null,
        total_hours: getTotalHours(updates.checkIn, updates.checkOut) ?? null,
        status: updates.status,
        remarks: updates.notes ?? null,
        edited_by: currentUser.id,
        edited_at: new Date().toISOString(),
      };

      if (currentUser.role === 'admin') {
        const response = await fetch('/api/admin/attendance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

      if (!response.ok) throw new Error(await parseApiError(response));

        const body = (await response.json()) as { data?: Parameters<typeof mapAttendanceRecord>[0] };
        if (body.data) {
          setAttendanceRecords((records) => upsertById(records, mapAttendanceRecord(body.data!)));
        }
      } else {
        const { id: _id, ...directPayload } = payload;
        const { error } = await supabase.from('attendance_logs').update(directPayload).eq('id', id);
        if (error) throw error;
        setAttendanceRecords((records) =>
          records.map((record) => (record.id === id ? { ...record, ...updates, editedBy: currentUser.name, editedAt: payload.edited_at } : record)),
        );
      }

      void refreshData();
    },
    [currentUser, refreshData, today],
  );

  const addAttendanceRecord = useCallback(
    async (record: Omit<AttendanceRecord, 'id'>) => {
      if (!currentUser) throw new Error('No active user session found.');

      const supabase = createClient();
      if (!supabase) throw new Error('Supabase is not configured.');

      const payload = {
        employee_id: record.userId,
        work_date: record.date,
        reporting_time: users.find((item) => item.id === record.userId)?.reportingTime ?? '09:00',
        check_in_at: record.checkIn ? new Date(`${record.date}T${record.checkIn}:00`).toISOString() : null,
        check_out_at: record.checkOut ? new Date(`${record.date}T${record.checkOut}:00`).toISOString() : null,
        total_hours: getTotalHours(record.checkIn, record.checkOut) ?? null,
        status: record.status,
        remarks: record.notes ?? null,
        edited_by: currentUser.id,
        edited_at: new Date().toISOString(),
      };

      const existing = attendanceRecords.find((item) => item.userId === record.userId && item.date === record.date);

      if (existing) {
        if (currentUser.role === 'admin') {
          const response = await fetch('/api/admin/attendance', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: existing.id, ...payload }),
          });

          if (!response.ok) throw new Error(await parseApiError(response));
          const body = (await response.json()) as { data?: Parameters<typeof mapAttendanceRecord>[0] };
          if (body.data) {
            setAttendanceRecords((records) => upsertById(records, mapAttendanceRecord(body.data!)));
          }
        } else {
          const { error } = await supabase.from('attendance_logs').update(payload).eq('id', existing.id);
          if (error) throw error;
          setAttendanceRecords((records) =>
            records.map((item) =>
              item.id === existing.id
                ? {
                    ...item,
                    ...record,
                    editedBy: currentUser.name,
                    editedAt: payload.edited_at,
                  }
                : item,
            ),
          );
        }
      } else if (currentUser.role === 'admin') {
        const response = await fetch('/api/admin/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(await parseApiError(response));
        const body = (await response.json()) as { data?: Parameters<typeof mapAttendanceRecord>[0] };
        if (body.data) {
          setAttendanceRecords((records) => upsertById(records, mapAttendanceRecord(body.data!)));
        }
      } else {
        const { error } = await supabase.from('attendance_logs').insert(payload);
        if (error) throw error;
      }

      void refreshData();
    },
    [attendanceRecords, currentUser, refreshData, users],
  );

  const updateUser = useCallback(
    async (userId: string, updates: Partial<User>) => {
      if (!currentUser) throw new Error('No active user session found.');

      if (currentUser.role === 'admin') {
        const response = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            id: userId,
            ...updates,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const nextUser = applyRolePosition({
          ...(users.find((user) => user.id === userId) ?? currentUser),
          ...updates,
          id: userId,
        } as User);
        setUsers((items) => items.map((item) => (item.id === userId ? nextUser : item)));
        if (currentUser.id === userId) setCurrentUser(nextUser);
        void refreshData();
        return;
      }

      if (currentUser.id !== userId) {
        throw new Error('You can only update your own profile.');
      }

      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          phone: updates.phone ?? '',
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setCurrentUser((user) => (user ? { ...user, phone: updates.phone } : user));
      setUsers((items) => items.map((item) => (item.id === userId ? { ...item, phone: updates.phone } : item)));
      void refreshData();
    },
    [currentUser, refreshData, users],
  );

  const updateUserHierarchy = useCallback(
    async (userId: string, updates: { lineManagerId?: string; projectManagerId?: string; directorId?: string }) => {
      await updateUser(userId, updates);
    },
    [updateUser],
  );

  const addUser = useCallback(
    async (user: Omit<User, 'id' | 'joinDate' | 'isActive' | 'position'> & { position?: string }) => {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const body = (await response.json()) as { data?: Parameters<typeof mapUser>[0] };
      if (body.data) {
        const createdUser = mapUser(body.data);
        setUsers((items) => upsertById(items, createdUser));
      }
      void refreshData();
    },
    [refreshData],
  );

  const unreadNotifications = notifications.filter((notification) => !notification.isRead).length;

  return (
    <AppContext.Provider
      value={{
        isLoggedIn,
        isLoading,
        currentUser,
        users,
        attendanceRecords,
        leaveRequests,
        holidays,
        notifications,
        unreadNotifications,
        pushNotificationsEnabled,
        pushNotificationsSupported,
        logout,
        markNotificationRead,
        markAllNotificationsRead,
        enablePushNotifications,
        checkIn,
        checkOut,
        submitLeaveRequest,
        deleteLeaveRequest,
        approveLeave,
        updateAttendanceRecord,
        addAttendanceRecord,
        updateUserHierarchy,
        updateUser,
        addUser,
        getTodayRecord,
        getAttendanceForUser,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }

  return context;
}
