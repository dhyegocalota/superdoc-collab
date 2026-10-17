import { ApiPath, type SessionUser } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { apiGet, readJson } from '@/lib/api';

export const SESSION_QUERY_KEY = ['me'];

async function fetchMe(): Promise<SessionUser | null> {
  const response = await apiGet(ApiPath.Me);
  const body = await readJson<{ user: SessionUser | null }>({ response, subject: 'Session request' });
  return body.user;
}

export function useSession(): { user: SessionUser | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe, retry: false });
  if (data === undefined) return { user: null, isLoading };
  return { user: data, isLoading };
}
