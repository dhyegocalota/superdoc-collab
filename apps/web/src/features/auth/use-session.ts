import { ApiPath, type SessionUser } from '@superdoc-history/types';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export const SESSION_QUERY_KEY = ['me'];

async function fetchMe(): Promise<SessionUser | null> {
  const response = await apiGet(ApiPath.Me);
  if (!response.ok) throw new Error(`Session request failed with status ${response.status}`);
  const body: { user: SessionUser | null } = await response.json();
  return body.user;
}

export function useSession(): { user: SessionUser | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe, retry: false });
  if (data === undefined) return { user: null, isLoading };
  return { user: data, isLoading };
}
