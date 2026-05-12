import PortalLayout from '../components/Layout';
import Attendance from '../pages/Attendance';
import { RouteTransition } from '@/components/route-transition';

export default function AttendancePage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <Attendance />
      </RouteTransition>
    </PortalLayout>
  );
}
