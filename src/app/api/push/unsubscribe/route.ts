import { requireAuthenticatedUser } from '@/server/auth';
import { deletePushSubscription } from '@/server/push-subscriptions';

export async function DELETE(request: Request) {
  const authResult = await requireAuthenticatedUser();
  if (authResult.response || !authResult.user) return authResult.response;

  return deletePushSubscription(request, authResult.user);
}
