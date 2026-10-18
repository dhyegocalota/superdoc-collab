import { authorColorKeyOf, authorColorSlot, type AuthorColorSlot, type EventAuthor } from '@superdoc-collab/types';
import { useMembers } from '@/features/editor/use-members';
import { useOpenedCreatorTicket } from '@/features/editor/use-opened-document';
import { useRequiredParam } from '@/lib/use-required-param';

export type AuthorColorSlotOf = (author: Pick<EventAuthor, 'id' | 'name'>) => AuthorColorSlot;

export function useAuthorColorSlots(): AuthorColorSlotOf | null {
  const documentId = useRequiredParam('documentId');
  const { members } = useMembers({ documentId, creatorTicket: useOpenedCreatorTicket(documentId) });
  if (members.length === 0) return null;
  return (author) => {
    const key = authorColorKeyOf(author);
    const member = members.find((candidate) => candidate.user.id === key);
    if (!member) return authorColorSlot(key);
    return member.colorSlot;
  };
}
