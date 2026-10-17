import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [oauthProviderClient(), inferAdditionalFields({ user: { timeZone: { type: 'string', required: true } } })],
});
