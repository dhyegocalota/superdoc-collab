import { HttpStatus } from '@superdoc-history/types';
import { ApiRequestError } from '@/lib/api';
import { authClient } from '@/features/auth/auth-client';
import { fetchOAuthClientName } from '@/features/oauth-consent/oauth-consent-api';
import { CONNECTED_APPS_LOAD_ERROR_MESSAGE, REVOKE_ERROR_MESSAGE } from './connected-apps-copy';

export const CONNECTED_APPS_QUERY_KEY = ['connected-apps'];

export type ConnectedApp = { id: string; clientName: string | null; isNameUnavailable: boolean; scopes: string[]; connectedAt: number };

async function nameOf(clientId: string): Promise<Pick<ConnectedApp, 'clientName' | 'isNameUnavailable'>> {
  try {
    return { clientName: await fetchOAuthClientName(clientId), isNameUnavailable: false };
  } catch {
    return { clientName: null, isNameUnavailable: true };
  }
}

export async function fetchConnectedApps(): Promise<ConnectedApp[]> {
  const { data: consents, error } = await authClient.oauth2.getConsents();
  if (error) throw new ApiRequestError(CONNECTED_APPS_LOAD_ERROR_MESSAGE);
  return Promise.all(
    consents.map(async (consent) => ({
      id: consent.id,
      ...(await nameOf(consent.clientId)),
      scopes: consent.scopes,
      connectedAt: new Date(consent.createdAt).getTime(),
    })),
  );
}

export async function revokeConnectedApp(id: string): Promise<void> {
  const { error } = await authClient.oauth2.deleteConsent({ id });
  if (error && error.status !== HttpStatus.NotFound) throw new ApiRequestError(REVOKE_ERROR_MESSAGE);
}
