import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { CONNECTED_APPS_QUERY_KEY, fetchConnectedApps, type ConnectedApp } from './connected-apps-api';

export function useConnectedApps(): UseQueryResult<ConnectedApp[]> {
  return useQuery({ queryKey: CONNECTED_APPS_QUERY_KEY, queryFn: fetchConnectedApps });
}
