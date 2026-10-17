import type { InviteStatus } from '@superdoc-collab/types';
import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchInvite, INVITE_QUERY_KEY } from './setup-api';

export function useInvite(token: string | null): UseQueryResult<InviteStatus> {
  return useQuery({
    queryKey: [...INVITE_QUERY_KEY, token],
    queryFn: token === null ? skipToken : () => fetchInvite(token),
    retry: false,
  });
}
