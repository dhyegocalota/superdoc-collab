import { skipToken, useQuery } from '@tanstack/react-query';
import { fetchVersion, versionQueryKey, VersionLoadKind, type VersionLoad } from './timeline-api';

function retryWhilePending(query: { state: { data: VersionLoad | undefined } }): number | false {
  const data = query.state.data;
  if (data?.kind !== VersionLoadKind.Pending) return false;
  return data.retryAfterMs;
}

export function useVersionLoad({ documentId, sequence }: { documentId: string; sequence: number | null }): {
  version: VersionLoad | undefined;
  isError: boolean;
} {
  const { data, isError } = useQuery({
    queryKey: versionQueryKey({ documentId, sequence }),
    queryFn: sequence === null ? skipToken : () => fetchVersion({ documentId, sequence }),
    staleTime: (query) => (query.state.data?.kind === VersionLoadKind.Ready ? Infinity : 0),
    refetchInterval: retryWhilePending,
    retry: false,
  });
  return { version: data, isError };
}
