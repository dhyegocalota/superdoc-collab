import type { DocumentMember } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { DocumentUnavailableError, pollWhileAvailable } from '@/lib/api';
import { fetchMembers, MEMBERS_REFRESH_MS, membersQueryKey } from './editor-api';

const NO_MEMBERS: DocumentMember[] = [];

export function useMembers(documentId: string): { members: DocumentMember[]; isUnavailable: boolean } {
  const { data, error } = useQuery({
    queryKey: membersQueryKey(documentId),
    queryFn: () => fetchMembers(documentId),
    refetchInterval: pollWhileAvailable(MEMBERS_REFRESH_MS),
    retry: false,
  });
  const isUnavailable = error instanceof DocumentUnavailableError;
  if (!data) return { members: NO_MEMBERS, isUnavailable };
  return { members: data.members, isUnavailable };
}
