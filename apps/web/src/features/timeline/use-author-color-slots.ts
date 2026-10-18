import { authorColorKeyOf, authorColorSlot, type AuthorColorSlot, type EventAuthor } from '@superdoc-collab/types';
import { useMembers } from '@/features/editor/use-members';
import { useRequiredParam } from '@/lib/use-required-param';

const DOCUMENT_ID_PARAM = 'documentId';

export type AuthorColorSlotOf = (author: Pick<EventAuthor, 'id' | 'name'>) => AuthorColorSlot;

export function useAuthorColorSlots(): AuthorColorSlotOf | null {
  const { members } = useMembers(useRequiredParam(DOCUMENT_ID_PARAM));
  if (members.length === 0) return null;
  return (author) => {
    const key = authorColorKeyOf(author);
    const member = members.find((candidate) => candidate.user.id === key);
    if (!member) return authorColorSlot(key);
    return member.colorSlot;
  };
}
