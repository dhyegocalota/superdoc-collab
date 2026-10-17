import { MEMBERS_REFRESH_MS, type DocumentMember } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { DocumentUnavailableError, pollWhileAvailable } from '@/lib/api';
import { fetchMembers, membersQueryKey } from './editor-api';

const NO_MEMBERS: DocumentMember[] = [];

type MembersResult = {
  members: DocumentMember[];
  isUnavailable: boolean;
  isCurrentUserOnline: boolean | null;
  membersAnsweredAt: number | null;
};

export function useMembers(documentId: string): MembersResult {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: membersQueryKey(documentId),
    queryFn: () => fetchMembers(documentId),
    refetchInterval: pollWhileAvailable(MEMBERS_REFRESH_MS),
    retry: false,
  });
  const isUnavailable = error instanceof DocumentUnavailableError;
  if (!data) return { members: NO_MEMBERS, isUnavailable, isCurrentUserOnline: null, membersAnsweredAt: null };
  if (error) return { members: data.members, isUnavailable, isCurrentUserOnline: null, membersAnsweredAt: null };
  return { members: data.members, isUnavailable, isCurrentUserOnline: data.isCurrentUserOnline, membersAnsweredAt: dataUpdatedAt };
}
