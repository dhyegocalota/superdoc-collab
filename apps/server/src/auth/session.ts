import { HttpStatus, UserRole, type SessionUser } from '@superdoc-collab/types';
import type { Auth } from './auth';
import { APIError } from 'better-auth/api';
import { impersonationEndOf } from './impersonation-validity';

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

function nullWhenUnauthorized(error: unknown): null {
  if (error instanceof APIError && error.statusCode === HttpStatus.Unauthorized) return null;
  throw error;
}

export type SessionDetails = { user: SessionUser; impersonationEndsAt: number | null };

export async function readSessionDetails({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionDetails | null> {
  const session = await auth.api.getSession({ headers }).catch(nullWhenUnauthorized);
  if (!session) return null;
  const { id, name, email, role, timeZone } = session.user;
  const user = { id, name, email, role: roleOf({ userId: id, role }), timeZone: timeZoneOf(timeZone), impersonatedBy: null };
  const { impersonatedBy, createdAt } = session.session;
  if (!impersonatedBy) return { user, impersonationEndsAt: null };
  return { user: { ...user, impersonatedBy }, impersonationEndsAt: impersonationEndOf(createdAt) };
}

export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const details = await readSessionDetails({ auth, headers });
  if (!details) return null;
  return details.user;
}
