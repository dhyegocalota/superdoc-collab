import type { AdminUser } from '@superdoc-history/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ADMIN_USERS_QUERY_KEY, fetchAdminUsers } from './admin-api';

export function useAdminUsers(): UseQueryResult<AdminUser[]> {
  return useQuery({ queryKey: ADMIN_USERS_QUERY_KEY, queryFn: fetchAdminUsers });
}
