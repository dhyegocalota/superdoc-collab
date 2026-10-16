import { ApiPath } from '@superdoc-history/types';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export const SESSION_QUERY_KEY = ['me'];

const UNAUTHORIZED_STATUS = 401;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

async function fetchMe(): Promise<SessionUser | null> {
  const response = await apiGet(ApiPath.Me);
  if (response.status === UNAUTHORIZED_STATUS) return null;
  if (!response.ok) throw new Error(`Session request failed with status ${response.status}`);
  const body: { user: SessionUser } = await response.json();
  return body.user;
}

export function useSession(): { user: SessionUser | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe, retry: false });
  if (data === undefined) return { user: null, isLoading };
  return { user: data, isLoading };
}
