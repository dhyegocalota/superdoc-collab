import { ADMINS_ONLY_MESSAGE, HttpStatus, UserRole } from '@superdoc-history/types';
import { createMiddleware } from 'hono/factory';
import type { SignedIn } from './require-user';

export function requireAdmin() {
  return createMiddleware<SignedIn>(async (context, next) => {
    if (context.var.user.role !== UserRole.Admin) return context.json({ error: ADMINS_ONLY_MESSAGE }, HttpStatus.Forbidden);
    await next();
  });
}
