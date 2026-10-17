import { UserRole, type SessionUser } from '@superdoc-collab/types';
import type { Auth } from './auth';

export class SessionUserWithoutRoleError extends Error {
  constructor(userId: string) {
    super(`Session user ${userId} has no role.`);
  }
}

function roleOf({ userId, role }: { userId: string; role: string | null | undefined }): UserRole {
  if (role === UserRole.Admin) return UserRole.Admin;
  if (role === UserRole.User) return UserRole.User;
  throw new SessionUserWithoutRoleError(userId);
}

function timeZoneOf(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value;
}

export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email, role, timeZone } = session.user;
  return { id, name, email, role: roleOf({ userId: id, role }), timeZone: timeZoneOf(timeZone) };
}
