import PortalLayout from '../components/Layout';
import LeaveRequestPage from '../pages/LeaveRequest';
import { RouteTransition } from '@/components/route-transition';

export default function LeavePage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <LeaveRequestPage />
      </RouteTransition>
    </PortalLayout>
  );
}
