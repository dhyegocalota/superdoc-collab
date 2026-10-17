import type { SetupStatus } from '@superdoc-history/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchSetup, SETUP_QUERY_KEY } from './setup-api';

export function useSetup(): UseQueryResult<SetupStatus> {
  return useQuery({ queryKey: SETUP_QUERY_KEY, queryFn: fetchSetup });
}
