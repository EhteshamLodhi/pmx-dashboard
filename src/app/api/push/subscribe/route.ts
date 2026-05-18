import { requireAuthenticatedUser } from '@/server/auth';
import { savePushSubscription } from '@/server/push-subscriptions';

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  return savePushSubscription(request, authResult.user);
}
