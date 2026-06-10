import type { User } from '@/app/types';

export function getVisibleUserIdsForHierarchy(currentUser: User | null | undefined, users: User[]) {
  if (!currentUser) return new Set<string>();
  if (currentUser.role === 'admin' || currentUser.role === 'director') {
    return new Set(users.map((user) => user.id));
  }

  const visible = new Set<string>([currentUser.id]);

  if (currentUser.role === 'manager') {
    users
      .filter((user) => user.lineManagerId === currentUser.id)
      .forEach((user) => visible.add(user.id));

    const projectRoots = users.filter((user) => user.projectManagerId === currentUser.id);
    const projectVisible = new Set<string>();
    projectRoots.forEach((user) => projectVisible.add(user.id));

    let changed = true;
    while (changed) {
      changed = false;
      users.forEach((user) => {
        if (!projectVisible.has(user.id) && user.lineManagerId && projectVisible.has(user.lineManagerId)) {
          projectVisible.add(user.id);
          changed = true;
        }
      });
    }

    projectVisible.forEach((id) => visible.add(id));
  }

  return visible;
}

export function getVisibleUsersForHierarchy(currentUser: User | null | undefined, users: User[]) {
  const visibleIds = getVisibleUserIdsForHierarchy(currentUser, users);
  return users.filter((user) => visibleIds.has(user.id));
}
