import { MEMBERS_REFRESH_MS, type DocumentAgent, type DocumentMember } from '@superdoc-collab/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AuthenticationError, DocumentUnavailableError, pollWhileAvailable } from '@/lib/api';
import { fetchMembers, membersQueryKey } from './editor-api';

const NO_MEMBERS: DocumentMember[] = [];
const NO_AGENTS: DocumentAgent[] = [];

type MembersResult = {
  members: DocumentMember[];
  agents: DocumentAgent[];
  isUnavailable: boolean;
  isCurrentUserOnline: boolean | null;
  membersAnsweredAt: number | null;
  isSessionEnded: boolean;
};

export function useMembers(documentId: string): MembersResult {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: membersQueryKey(documentId),
    placeholderData: keepPreviousData,
    queryFn: () => fetchMembers(documentId),
    refetchInterval: pollWhileAvailable(MEMBERS_REFRESH_MS),
    retry: false,
  });
  const isUnavailable = error instanceof DocumentUnavailableError;
  const isSessionEnded = error instanceof AuthenticationError;
  if (!data)
    return {
      members: NO_MEMBERS,
      agents: NO_AGENTS,
      isUnavailable,
      isCurrentUserOnline: null,
      membersAnsweredAt: null,
      isSessionEnded,
    };
  if (error)
    return {
      members: data.members,
      agents: data.agents,
      isUnavailable,
      isCurrentUserOnline: null,
      membersAnsweredAt: null,
      isSessionEnded,
    };
  return {
    members: data.members,
    agents: data.agents,
    isUnavailable,
    isCurrentUserOnline: data.isCurrentUserOnline,
    membersAnsweredAt: dataUpdatedAt,
    isSessionEnded,
  };
}
