import { DocumentRole, type DocumentMember } from '@superdoc-collab/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/features/documents/documents-copy';
import { fetchMembers, membersQueryKey, revokeMember } from './editor-api';
import { PEOPLE_WITH_ACCESS_LABEL, REMOVE_FAILED_MESSAGE, REMOVE_LABEL, removeMemberLabel } from './editor-copy';

function MemberRow({ documentId, member }: { documentId: string; member: DocumentMember }) {
  const queryClient = useQueryClient();
  const isOwner = member.role === DocumentRole.Owner;
  const {
    mutate: remove,
    isPending,
    isError,
  } = useMutation({
    mutationFn: () => revokeMember({ documentId, userId: member.user.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersQueryKey(documentId) }),
  });

  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{member.user.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</span>
          {!isOwner && (
            <Button
              variant="outline"
              size="sm"
              aria-label={removeMemberLabel(member.user.name)}
              disabled={isPending}
              aria-busy={isPending}
              onClick={() => remove()}
            >
              {REMOVE_LABEL}
            </Button>
          )}
        </span>
      </div>
      {isError && <ErrorMessage>{REMOVE_FAILED_MESSAGE}</ErrorMessage>}
    </li>
  );
}

export function PeopleWithAccess({ documentId }: { documentId: string }) {
  const { data } = useQuery({
    queryKey: membersQueryKey(documentId),
    queryFn: () => fetchMembers({ documentId, creatorTicket: null }),
  });
  if (!data) return null;

  return (
    <div role="group" aria-label={PEOPLE_WITH_ACCESS_LABEL} className="space-y-2">
      <p className="text-sm font-medium">{PEOPLE_WITH_ACCESS_LABEL}</p>
      <ul className="space-y-2">
        {data.members.map((member) => (
          <MemberRow key={member.user.id} documentId={documentId} member={member} />
        ))}
      </ul>
    </div>
  );
}
