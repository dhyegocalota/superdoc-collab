import { IMPERSONATION_SESSION_MS, UserRole, type SessionUser } from '@superdoc-collab/types';
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

type ImpersonatorRow = { role: string | null; banned: boolean | null };

async function isImpersonationValid({
  auth,
  impersonatedBy,
  createdAt,
}: {
  auth: Auth;
  impersonatedBy: string;
  createdAt: Date;
}): Promise<boolean> {
  const hasExpired = createdAt.getTime() + IMPERSONATION_SESSION_MS < Date.now();
  if (hasExpired) return false;
  const { adapter } = await auth.$context;
  const impersonator = await adapter.findOne<ImpersonatorRow>({ model: 'user', where: [{ field: 'id', value: impersonatedBy }] });
  if (!impersonator) return false;
  return impersonator.role === UserRole.Admin && !impersonator.banned;
}

export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email, role, timeZone } = session.user;
  const sessionUser = { id, name, email, role: roleOf({ userId: id, role }), timeZone: timeZoneOf(timeZone) };
  const { impersonatedBy, createdAt } = session.session;
  if (!impersonatedBy) return sessionUser;
  if (!(await isImpersonationValid({ auth, impersonatedBy, createdAt }))) return null;
  return { ...sessionUser, impersonatedBy };
}
