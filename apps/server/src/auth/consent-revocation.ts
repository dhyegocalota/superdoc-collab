import type { BetterAuthPlugin } from 'better-auth';
import { IMPERSONATED_CONSENT_MESSAGE } from '@superdoc-collab/types';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import type { AuthDatabase } from '../database/connection';
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from '../database/schema/auth';

const IMPERSONATION_REFUSED_PATHS = ['/oauth2/consent', '/oauth2/authorize', '/revoke-other-sessions'];
const DELETE_CONSENT_PATH = '/oauth2/delete-consent';
const UPDATE_CONSENT_PATH = '/oauth2/update-consent';
const CONSENT_MODEL = 'oauthConsent';
const TOKEN_MODELS = ['oauthRefreshToken', 'oauthAccessToken'];

type ConsentRow = { userId: string; clientId: string };

const revokeTokensOfConsent = createAuthMiddleware(async (context) => {
  const consentId = context.body?.id;
  const session = await getSessionFromCtx(context);
  if (!session || typeof consentId !== 'string') return;
  const { adapter } = context.context;
  const consent = await adapter.findOne<ConsentRow>({ model: CONSENT_MODEL, where: [{ field: 'id', value: consentId }] });
  if (!consent || consent.userId !== session.user.id) return;
  const owner = [
    { field: 'userId', value: consent.userId },
    { field: 'clientId', value: consent.clientId },
  ];
  await Promise.all(TOKEN_MODELS.map((model) => adapter.deleteMany({ model, where: owner })));
});

const refuseImpersonatedGrants = createAuthMiddleware(async (context) => {
  const session = await getSessionFromCtx(context);
  if (!session?.session.impersonatedBy) return;
  throw new APIError('FORBIDDEN', { message: IMPERSONATED_CONSENT_MESSAGE });
});

export function revokeOAuthGrantsOf({ database, userId }: { database: AuthDatabase; userId: string }): void {
  database.drizzle.transaction((transaction) => {
    transaction.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)).run();
    transaction.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId)).run();
    transaction.delete(oauthConsent).where(eq(oauthConsent.userId, userId)).run();
  });
}

export function consentRevocationPlugin() {
  return {
    id: 'consent-revocation',
    hooks: {
      before: [
        {
          matcher: (context: { path?: string }) => context.path === DELETE_CONSENT_PATH || context.path === UPDATE_CONSENT_PATH,
          handler: revokeTokensOfConsent,
        },
        {
          matcher: (context: { path?: string }) => IMPERSONATION_REFUSED_PATHS.some((path) => path === context.path),
          handler: refuseImpersonatedGrants,
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
