import PortalLayout from '../components/Layout';
import Approvals from '../pages/Approvals';
import { RouteTransition } from '@/components/route-transition';

export default function ApprovalsPage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <Approvals />
      </RouteTransition>
    </PortalLayout>
  );
}
