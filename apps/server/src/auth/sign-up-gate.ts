import { INVITE_TOKEN_HEADER, SIGN_UP_BY_INVITATION_MESSAGE, UserRole } from '@superdoc-collab/types';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { and, eq, notExists } from 'drizzle-orm';
import type { InvitesRepository } from '../admin/invites';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';

export const SIGN_UP_PATH = '/sign-up/email';
const PLUGIN_ID = 'sign-up-gate';

type CreatedUser = { id: string };

function isSignUp(context: { path?: string }): boolean {
  return context.path === SIGN_UP_PATH;
}

function inviteTokenOf(headers: Headers | undefined): string | null {
  if (!headers) return null;
  return headers.get(INVITE_TOKEN_HEADER);
}

function createdUserOf(returned: unknown): CreatedUser | null {
  if (!returned || typeof returned !== 'object' || !('user' in returned)) return null;
  const candidate = returned.user;
  if (!candidate || typeof candidate !== 'object' || !('id' in candidate) || typeof candidate.id !== 'string') return null;
  return { id: candidate.id };
}

// NB ADR 0020: the admin is whoever wins this single conditional update; no read-then-write can crown two.
function claimAdmin({ database, userId }: { database: AuthDatabase; userId: string }): boolean {
  const noAdminExists = notExists(database.drizzle.select({ id: user.id }).from(user).where(eq(user.role, UserRole.Admin)));
  const result = database.drizzle
    .update(user)
    .set({ role: UserRole.Admin })
    .where(and(eq(user.id, userId), noAdminExists))
    .run();
  return result.changes === 1;
}

function refuse({ database, userId }: { database: AuthDatabase; userId: string }): never {
  database.drizzle.delete(user).where(eq(user.id, userId)).run();
  throw new APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE });
}

export function createSignUpGate({ invites, database }: { invites: InvitesRepository; database: AuthDatabase }): BetterAuthPlugin {
  const before = createAuthMiddleware(async (context) => {
    if (!invites.hasAnyUser()) return;
    const token = inviteTokenOf(context.headers);
    if (token && invites.resolvePending(token)) return;
    throw new APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE });
  });

  const after = createAuthMiddleware(async (context) => {
    const created = createdUserOf(context.context.returned);
    if (!created) return;
    if (claimAdmin({ database, userId: created.id })) return;
    const token = inviteTokenOf(context.headers);
    if (!token) refuse({ database, userId: created.id });
    const pending = invites.resolvePending(token);
    if (pending && invites.accept({ id: pending.id, userId: created.id })) return;
    refuse({ database, userId: created.id });
  });

  return {
    id: PLUGIN_ID,
    hooks: {
      before: [{ matcher: isSignUp, handler: before }],
      after: [{ matcher: isSignUp, handler: after }],
    },
  };
}
