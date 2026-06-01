import Reimbursements from '../pages/Reimbursements';
import { RouteTransition } from '@/components/route-transition';

export default function ReimbursementsPage() {
  return (
    <RouteTransition>
      <Reimbursements />
    </RouteTransition>
  );
}
