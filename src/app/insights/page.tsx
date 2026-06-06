import PortalLayout from '../components/Layout';
import EmployeeInsights from '../pages/EmployeeInsights';
import { RouteTransition } from '@/components/route-transition';

export default function InsightsPage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <EmployeeInsights />
      </RouteTransition>
    </PortalLayout>
  );
}
