import PortalLayout from '../../components/Layout';
import AdminAttendance from '../../pages/AdminAttendance';
import { RouteTransition } from '@/components/route-transition';

export default function AdminAttendancePage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <AdminAttendance />
      </RouteTransition>
    </PortalLayout>
  );
}
