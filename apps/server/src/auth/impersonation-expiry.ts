import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { isImpersonationValid } from './impersonation-validity';

const endImpersonationOutsideItsRules = createAuthMiddleware(async (context) => {
  const session = await getSessionFromCtx(context);
  if (!session?.session.impersonatedBy) return;
  const { adapter, internalAdapter } = context.context;
  const isValid = await isImpersonationValid({
    adapter,
    impersonatedBy: session.session.impersonatedBy,
    createdAt: session.session.createdAt,
  });
  if (isValid) return;
  await internalAdapter.deleteSession(session.session.token);
  throw new APIError('UNAUTHORIZED');
});

export function impersonationExpiryPlugin() {
  return {
    id: 'impersonation-expiry',
    hooks: { before: [{ matcher: () => true, handler: endImpersonationOutsideItsRules }] },
  } satisfies BetterAuthPlugin;
}
