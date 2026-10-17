import { ApiRequestError } from '@/lib/api';
import { authClient } from '@/features/auth/auth-client';
import { CLIENT_LOAD_ERROR_MESSAGE, CONSENT_FAILED_MESSAGE } from './oauth-consent-copy';

export const OAUTH_CLIENT_QUERY_KEY = ['oauth-client'];

export async function fetchOAuthClientName(clientId: string): Promise<string> {
  const { data, error } = await authClient.oauth2.publicClient({ query: { client_id: clientId } });
  if (error || !data?.client_name) throw new ApiRequestError(CLIENT_LOAD_ERROR_MESSAGE);
  return data.client_name;
}

export async function submitConsent(accept: boolean): Promise<void> {
  const { error } = await authClient.oauth2.consent({ accept });
  if (error) throw new ApiRequestError(CONSENT_FAILED_MESSAGE);
}
