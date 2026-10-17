import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

export const MAX_CLIENT_NAME_LENGTH = 100;
export const MAX_REDIRECT_URIS = 10;
const REGISTER_PATH = '/oauth2/register';
const INVALID_CLIENT_METADATA = 'invalid_client_metadata';

const limitRegistration = createAuthMiddleware(async (context) => {
  if (!context.body) return;
  const { client_name: clientName, redirect_uris: redirectUris } = context.body;
  const isNameTooLong = typeof clientName === 'string' && clientName.length > MAX_CLIENT_NAME_LENGTH;
  const hasTooManyRedirects = Array.isArray(redirectUris) && redirectUris.length > MAX_REDIRECT_URIS;
  if (!isNameTooLong && !hasTooManyRedirects) return;
  throw new APIError('BAD_REQUEST', { error: INVALID_CLIENT_METADATA, error_description: 'Client metadata is too large.' });
});

export function registrationLimitsPlugin() {
  return {
    id: 'registration-limits',
    hooks: { before: [{ matcher: (context: { path?: string }) => context.path === REGISTER_PATH, handler: limitRegistration }] },
  } satisfies BetterAuthPlugin;
}
