import { MEMBERS_REFRESH_MS, type CreatorTicket, type DocumentMember } from '@superdoc-collab/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AuthenticationError, DocumentUnavailableError, pollWhileAvailable } from '@/lib/api';
import { fetchMembers, membersQueryKey } from './editor-api';

const NO_MEMBERS: DocumentMember[] = [];

type MembersResult = {
  members: DocumentMember[];
  isUnavailable: boolean;
  isCurrentUserOnline: boolean | null;
  membersAnsweredAt: number | null;
  isSessionEnded: boolean;
  isAttemptSuperseded: boolean;
  isAttemptRestarted: boolean;
};

export function useMembers({ documentId, creatorTicket }: { documentId: string; creatorTicket: CreatorTicket | null }): MembersResult {
  const ticketSegments = creatorTicket ? [creatorTicket.attempt, creatorTicket.epoch] : [];
  const { data, error, dataUpdatedAt, isPlaceholderData } = useQuery({
    queryKey: [...membersQueryKey(documentId), ...ticketSegments],
    placeholderData: keepPreviousData,
    queryFn: () => fetchMembers({ documentId, creatorTicket }),
    refetchInterval: pollWhileAvailable(MEMBERS_REFRESH_MS),
    retry: false,
  });
  const isUnavailable = error instanceof DocumentUnavailableError;
  const isSessionEnded = error instanceof AuthenticationError;
  if (!data)
    return {
      members: NO_MEMBERS,
      isUnavailable,
      isCurrentUserOnline: null,
      membersAnsweredAt: null,
      isSessionEnded,
      isAttemptSuperseded: false,
      isAttemptRestarted: false,
    };
  if (error)
    return {
      members: data.members,
      isUnavailable,
      isCurrentUserOnline: null,
      membersAnsweredAt: null,
      isSessionEnded,
      isAttemptSuperseded: false,
      isAttemptRestarted: false,
    };
  return {
    members: data.members,
    isUnavailable,
    isCurrentUserOnline: data.isCurrentUserOnline,
    membersAnsweredAt: dataUpdatedAt,
    isSessionEnded,
    isAttemptSuperseded: data.isAttemptSuperseded && !isPlaceholderData,
    isAttemptRestarted: data.isAttemptRestarted && !isPlaceholderData,
  };
}
