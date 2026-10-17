import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

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

export function consentRevocationPlugin() {
  return {
    id: 'consent-revocation',
    hooks: {
      before: [
        {
          matcher: (context: { path?: string }) => context.path === DELETE_CONSENT_PATH || context.path === UPDATE_CONSENT_PATH,
          handler: revokeTokensOfConsent,
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
