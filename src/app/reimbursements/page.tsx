import PortalLayout from '../components/Layout';
import Reimbursements from '../pages/Reimbursements';
import { RouteTransition } from '@/components/route-transition';

export default function ReimbursementsPage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <Reimbursements />
      </RouteTransition>
    </PortalLayout>
  );
}
