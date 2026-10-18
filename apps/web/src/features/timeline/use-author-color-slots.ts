import type { AuthorColorSlot, EventAuthor } from '@superdoc-collab/types';

export type AuthorColorSlotOf = (author: Pick<EventAuthor, 'id' | 'name'>) => AuthorColorSlot;

export function useAuthorColorSlots(): AuthorColorSlotOf {
  throw new Error('useAuthorColorSlots is not implemented');
}
