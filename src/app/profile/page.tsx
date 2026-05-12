import PortalLayout from '../components/Layout';
import Profile from '../pages/Profile';
import { RouteTransition } from '@/components/route-transition';

export default function ProfilePage() {
  return (
    <PortalLayout>
      <RouteTransition>
        <Profile />
      </RouteTransition>
    </PortalLayout>
  );
}
