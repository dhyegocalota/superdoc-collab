import { HttpStatus, type SessionUser } from '@superdoc-collab/types';
import { createMiddleware } from 'hono/factory';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';

const UNAUTHORIZED_MESSAGE = 'Unauthorized';

export type SignedIn = { Variables: { user: SessionUser } };

export function requireUser({ auth }: { auth: Auth }) {
  return createMiddleware<SignedIn>(async (context, next) => {
    const user = await readSession({ auth, headers: context.req.raw.headers });
    if (!user) return context.json({ error: UNAUTHORIZED_MESSAGE }, HttpStatus.Unauthorized);
    context.set('user', user);
    await next();
  });
}
