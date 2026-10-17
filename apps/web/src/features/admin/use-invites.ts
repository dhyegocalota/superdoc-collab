import type { InviteSummary } from '@superdoc-history/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchInvites, INVITES_QUERY_KEY } from './admin-api';

export function useInvites(): UseQueryResult<InviteSummary[]> {
  return useQuery({ queryKey: INVITES_QUERY_KEY, queryFn: fetchInvites });
}
