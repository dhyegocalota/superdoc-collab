import type { SessionUser } from '@superdoc-history/types';
import type { Auth } from './auth';

export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

export class SessionUserWithoutRoleError extends Error {}
