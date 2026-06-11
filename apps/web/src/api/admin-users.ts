import { apiFetch, parseJson } from './http';
import type { UserRole } from '../lib/permissions';

export type AdminUserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
};

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const res = await apiFetch('/v1/admin/users');
  const data = await parseJson<{ users: AdminUserRecord[] }>(res);
  return data.users;
}

export async function updateAdminUser(
  userId: string,
  patch: { role?: UserRole; firstName?: string; lastName?: string },
): Promise<AdminUserRecord> {
  const res = await apiFetch(`/v1/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ user: AdminUserRecord }>(res);
  return data.user;
}
