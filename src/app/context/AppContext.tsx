'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification, AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveType, User } from '../types';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { mapAttendanceRecord, mapLeaveRequest, mapNotification, mapUser } from '@/lib/supabase/mappers';

interface AppContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  currentUser: User | null;
  users: User[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  notifications: AppNotification[];
  unreadNotifications: number;
  logout: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  enablePushNotifications: () => Promise<void>;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
  submitLeaveRequest: (data: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
  }) => Promise<void>;
  approveLeave: (leaveId: string, level: 1 | 2, approved: boolean, comment: string) => Promise<void>;
  updateAttendanceRecord: (id: string, updates: Partial<AttendanceRecord>) => Promise<void>;
  addAttendanceRecord: (record: Omit<AttendanceRecord, 'id'>) => Promise<void>;
  updateUserHierarchy: (userId: string, updates: { lineManagerId?: string; projectManagerId?: string; directorId?: string }) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'joinDate' | 'isActive' | 'position'> & { position?: string }) => Promise<void>;
  getTodayRecord: (userId?: string) => AttendanceRecord | undefined;
  getAttendanceForUser: (userId: string) => AttendanceRecord[];
  refreshData: () => Promise<void>;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const supabaseEnabled = isSupabaseConfigured();
  const today = useMemo(() => getTodayIsoDate(), []);

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
    async (supabase: SupabaseClient, session: Session | null) => {
      if (!session?.user) {
        setCurrentUser(null);
        setUsers([]);
        setAttendanceRecords([]);
        setLeaveRequests([]);
        setNotifications([]);
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        await bootstrapProfile();
        const me = await fetchCurrentProfile();

        const [usersResult, attendanceResult, leaveResult, notificationResult] = await Promise.allSettled([
          supabase
            .from('users')
            .select('*, department:department_id(name), project:project_id(name)')
            .order('full_name'),
          supabase
            .from('attendance_logs')
            .select('*, editor:edited_by(full_name)')
            .order('work_date', { ascending: false }),
          supabase
            .from('leave_requests')
            .select(`
              *,
              employee:employee_id(full_name, department:department_id(name)),
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
        if (notificationError) {
          console.error('Notification query failed during session sync', notificationError);
        }

        const mappedUsers = (usersData as Parameters<typeof mapUser>[0][]).map(mapUser);
        const mappedAttendance = (attendanceData as Parameters<typeof mapAttendanceRecord>[0][]).map(mapAttendanceRecord);
        const mappedLeaves = (leaveData as Parameters<typeof mapLeaveRequest>[0][]).map(mapLeaveRequest);
        const mappedNotifications = (notificationData as Parameters<typeof mapNotification>[0][]).map(mapNotification);
        const resolvedCurrentUser = me ?? mappedUsers.find((item) => item.id === session.user.id) ?? null;
        const resolvedUsers =
          resolvedCurrentUser && !mappedUsers.some((item) => item.id === resolvedCurrentUser.id)
            ? [resolvedCurrentUser, ...mappedUsers]
            : mappedUsers;

        setUsers(resolvedUsers);
        setAttendanceRecords(mappedAttendance);
        setLeaveRequests(mappedLeaves);
        setNotifications(mappedNotifications);
        setCurrentUser(resolvedCurrentUser);
        setIsLoggedIn(Boolean(resolvedCurrentUser));
      } catch (error) {
        console.error('Supabase session sync failed', error);
        setUsers([]);
        setAttendanceRecords([]);
        setLeaveRequests([]);
        setNotifications([]);
        setCurrentUser(null);
        setIsLoggedIn(false);
      } finally {
        setIsLoading(false);
      }
    },
    [bootstrapProfile, fetchCurrentProfile],
  );

  const refreshData = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    await syncSession(supabase, session);
  }, [syncSession]);

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
      await syncSession(supabase, session);
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(supabase, session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseEnabled, syncSession]);

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
          if (payload.eventType === 'INSERT' && 'Notification' in window && Notification.permission === 'granted') {
            const row = payload.new as { title?: string; message?: string; link?: string };
            navigator.serviceWorker.ready
              .then((registration) =>
                registration.showNotification(row.title ?? 'PowerMatix', {
                  body: row.message ?? 'You have a new notification.',
                  icon: '/icon.svg',
                  data: { link: row.link ?? '/dashboard' },
                }),
              )
              .catch(() => undefined);
          }
          void refreshData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser, refreshData]);

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
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error(await parseApiError(response));
      await refreshData();
    },
    [refreshData],
  );

  const markAllNotificationsRead = useCallback(async () => {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ markAllRead: true }),
    });

    if (!response.ok) throw new Error(await parseApiError(response));
    await refreshData();
  }, [refreshData]);

  const enablePushNotifications = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications are not supported on this device.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted.');
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    const subscription =
      existingSubscription ??
      (publicKey
        ? await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          })
        : null);

    if (!subscription) {
      throw new Error('Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to enable browser push subscriptions.');
    }

    const response = await fetch('/api/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subscription),
    });

    if (!response.ok) throw new Error(await parseApiError(response));
  }, []);

  const checkIn = useCallback(async () => {
    if (!currentUser) throw new Error('No active user session found.');

    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'check-in' }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    await refreshData();
  }, [currentUser, refreshData]);

  const checkOut = useCallback(async () => {
    if (!currentUser) throw new Error('No active user session found.');

    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'check-out' }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    await refreshData();
  }, [currentUser, refreshData]);

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

      await refreshData();
    },
    [refreshData],
  );

  const approveLeave = useCallback(
    async (leaveId: string, level: 1 | 2, approved: boolean, comment: string) => {
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

      await refreshData();
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
      } else {
        const { id: _id, ...directPayload } = payload;
        const { error } = await supabase.from('attendance_logs').update(directPayload).eq('id', id);
        if (error) throw error;
      }

      await refreshData();
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
        } else {
          const { error } = await supabase.from('attendance_logs').update(payload).eq('id', existing.id);
          if (error) throw error;
        }
      } else if (currentUser.role === 'admin') {
        const response = await fetch('/api/admin/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(await parseApiError(response));
      } else {
        const { error } = await supabase.from('attendance_logs').insert(payload);
        if (error) throw error;
      }

      await refreshData();
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

        await refreshData();
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

      await refreshData();
    },
    [currentUser, refreshData],
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

      await refreshData();
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
        notifications,
        unreadNotifications,
        logout,
        markNotificationRead,
        markAllNotificationsRead,
        enablePushNotifications,
        checkIn,
        checkOut,
        submitLeaveRequest,
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
