import type { UserRole } from '@/app/types';

export const rolePermissions: Record<UserRole, string[]> = {
  employee: ['attendance:self', 'leave:self'],
  manager: ['attendance:self', 'leave:self', 'approval:manager'],
  director: ['attendance:self', 'leave:self', 'approval:director'],
  admin: ['*'],
};

export function can(role: UserRole | undefined, permission: string) {
  if (!role) return false;
  const permissions = rolePermissions[role];
  return permissions.includes('*') || permissions.includes(permission);
}

export function assertPermission(role: UserRole | undefined, permission: string) {
  if (!can(role, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
