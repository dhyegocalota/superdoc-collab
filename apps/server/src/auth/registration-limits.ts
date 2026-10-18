import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

export const MAX_CLIENT_NAME_LENGTH = 100;
export const MAX_REDIRECT_URIS = 10;
export const MAX_METADATA_URI_LENGTH = 512;
export const MAX_CONTACTS = 3;
export const MAX_CONTACT_LENGTH = 254;
export const REGISTER_PATH = '/oauth2/register';
const METADATA_URI_FIELDS = ['logo_uri', 'client_uri', 'policy_uri', 'tos_uri'];
const INVALID_CLIENT_METADATA = 'invalid_client_metadata';
const CLIENT_METADATA_TOO_LARGE_MESSAGE = 'Client metadata is too large.';

function isLongerThan({ value, limit }: { value: unknown; limit: number }): boolean {
  return typeof value === 'string' && value.length > limit;
}

const limitRegistration = createAuthMiddleware(async (context) => {
  if (!context.body) return;
  const { client_name: clientName, redirect_uris: redirectUris, contacts } = context.body;
  const isNameTooLong = isLongerThan({ value: clientName, limit: MAX_CLIENT_NAME_LENGTH });
  const hasTooManyRedirects = Array.isArray(redirectUris) && redirectUris.length > MAX_REDIRECT_URIS;
  const hasLongUri = METADATA_URI_FIELDS.some((field) => isLongerThan({ value: context.body[field], limit: MAX_METADATA_URI_LENGTH }));
  const hasTooManyContacts = Array.isArray(contacts) && contacts.length > MAX_CONTACTS;
  const hasLongContact = Array.isArray(contacts) && contacts.some((contact) => isLongerThan({ value: contact, limit: MAX_CONTACT_LENGTH }));
  const isOversized = isNameTooLong || hasTooManyRedirects || hasLongUri || hasTooManyContacts || hasLongContact;
  if (!isOversized) return;
  throw new APIError('BAD_REQUEST', { error: INVALID_CLIENT_METADATA, error_description: CLIENT_METADATA_TOO_LARGE_MESSAGE });
});

export function registrationLimitsPlugin() {
  return {
    id: 'registration-limits',
    hooks: { before: [{ matcher: (context: { path?: string }) => context.path === REGISTER_PATH, handler: limitRegistration }] },
  } satisfies BetterAuthPlugin;
}
