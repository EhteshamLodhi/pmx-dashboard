import PortalLayout from '../../components/Layout';
import UserManagement from '../../pages/UserManagement';
import { RouteTransition } from '@/components/route-transition';

export default function AdminUsersPage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <UserManagement />
      </RouteTransition>
    </PortalLayout>
  );
}
