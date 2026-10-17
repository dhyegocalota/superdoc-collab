import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchOAuthClientName, OAUTH_CLIENT_QUERY_KEY } from './oauth-consent-api';

export function useOAuthClientName(clientId: string): UseQueryResult<string> {
  return useQuery({ queryKey: [...OAUTH_CLIENT_QUERY_KEY, clientId], queryFn: () => fetchOAuthClientName(clientId) });
}
