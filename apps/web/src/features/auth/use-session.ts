import { ApiPath, SESSION_STALE_TIME_MS, type SessionUser } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { apiGet, AuthenticationError, readJson } from '@/lib/api';

export const SESSION_QUERY_KEY = ['me'];

export async function fetchMe(): Promise<SessionUser | null> {
  const response = await apiGet(ApiPath.Me);
  try {
    const body = await readJson<{ user: SessionUser | null }>({ response, subject: 'Session request' });
    return body.user;
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export function useSession(): { user: SessionUser | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe, staleTime: SESSION_STALE_TIME_MS, retry: false });
  if (data === undefined) return { user: null, isLoading };
  return { user: data, isLoading };
}
