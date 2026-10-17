import { ApiRequestError } from '@/lib/api';
import { authClient } from '@/features/auth/auth-client';
import { EXPIRED_REQUEST_MESSAGE } from '@/features/auth/auth-copy';
import { isExpiredRequest } from '@/features/auth/auth-failure';
import { CONSENT_FAILED_MESSAGE } from './oauth-consent-copy';

export const OAUTH_CLIENT_QUERY_KEY = ['oauth-client'];

export async function fetchOAuthClientName(clientId: string): Promise<string | null> {
  const { data, error } = await authClient.oauth2.publicClient({ query: { client_id: clientId } });
  if (error || !data?.client_name) return null;
  return data.client_name;
}

export async function submitConsent(accept: boolean): Promise<void> {
  const { error } = await authClient.oauth2.consent({ accept });
  if (error && isExpiredRequest(error)) throw new ApiRequestError(EXPIRED_REQUEST_MESSAGE);
  if (error) throw new ApiRequestError(CONSENT_FAILED_MESSAGE);
}
