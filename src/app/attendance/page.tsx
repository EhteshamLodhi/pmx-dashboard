'use client';

import PortalLayout from '../components/Layout';
import Attendance from '../pages/Attendance';
import AdminAttendance from '../pages/AdminAttendance';
import { RouteTransition } from '@/components/route-transition';
import { useApp } from '../context/AppContext';

function AttendanceRouteContent() {
  const { currentUser } = useApp();

  if (currentUser?.role === 'admin' || currentUser?.role === 'director') {
    return <AdminAttendance />;
  }

  return <Attendance />;
}

export default function AttendancePage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <AttendanceRouteContent />
      </RouteTransition>
    </PortalLayout>
  );
}
