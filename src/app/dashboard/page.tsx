import PortalLayout from '../components/Layout';
import Dashboard from '../pages/Dashboard';
import { RouteTransition } from '@/components/route-transition';

export default function DashboardPage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <Dashboard />
      </RouteTransition>
    </PortalLayout>
  );
}
