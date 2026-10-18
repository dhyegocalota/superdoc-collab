import { authorColorKeyOf, authorColorSlot, documentPagePath, DocumentRole, RoomMode, type DocumentMember } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { openedDocumentQueryKey } from '@/features/editor/editor-api';
import { DOCUMENT_ID, openedAs } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { useAuthorColorSlots } from './use-author-color-slots';

const { useMembers } = vi.hoisted(() => ({ useMembers: vi.fn() }));

vi.mock('@/features/editor/use-members', () => ({ useMembers }));

const MEMBER_ID = 'u1';
const MEMBER_SLOT = authorColorSlot(MEMBER_ID) === 6 ? 1 : 6;
const member: DocumentMember = { user: { id: MEMBER_ID, name: 'Ana' }, role: DocumentRole.Editor, online: true, colorSlot: MEMBER_SLOT };

function resolverWith(members: DocumentMember[]) {
  useMembers.mockReturnValue({ members });
  const { result } = renderHookWithRouter(() => useAuthorColorSlots(), { route: documentPagePath(DOCUMENT_ID) });
  return result.current;
}

function slotOfAuthor(author: { id: string | null; name: string }) {
  const slotOf = resolverWith([member]);
  if (slotOf === null) throw new Error('the members answered, a resolver is expected');
  return slotOf(author);
}

test('a member resolves to the slot its members response carries, not to the id hash', () => {
  expect(slotOfAuthor({ id: MEMBER_ID, name: 'Ana' })).toBe(MEMBER_SLOT);
});

test('an agent resolves to the slot of its person', () => {
  expect(slotOfAuthor({ id: `${MEMBER_ID}#agent`, name: 'Ana' })).toBe(MEMBER_SLOT);
});

test('an author who is not a member resolves to the hash of its key', () => {
  const stranger = { id: 'removed-user', name: 'Carla' };
  const imported = { id: null, name: 'Chris Crawford' };
  expect(slotOfAuthor(stranger)).toBe(authorColorSlot(authorColorKeyOf(stranger)));
  expect(slotOfAuthor(imported)).toBe(authorColorSlot(authorColorKeyOf(imported)));
});

test('before the members answer there is no resolver, so no member is given the hash colour', () => {
  expect(resolverWith([])).toBeNull();
});

test('the members are read with the creator ticket of the opened document, the key the page polls', () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(openedDocumentQueryKey(DOCUMENT_ID), {
    ...openedAs(DocumentRole.Owner, RoomMode.Create),
    creatorAttempt: 2,
    creatorEpoch: 'epoch-1',
  });
  useMembers.mockReturnValue({ members: [member] });
  renderHookWithRouter(() => useAuthorColorSlots(), { route: documentPagePath(DOCUMENT_ID), queryClient });
  expect(useMembers).toHaveBeenLastCalledWith({ documentId: DOCUMENT_ID, creatorTicket: { attempt: 2, epoch: 'epoch-1' } });
});

test('the members are read without a ticket when the opened document carries none or is not loaded', () => {
  const queryClient = new QueryClient();
  useMembers.mockReturnValue({ members: [member] });
  renderHookWithRouter(() => useAuthorColorSlots(), { route: documentPagePath(DOCUMENT_ID), queryClient });
  expect(useMembers).toHaveBeenLastCalledWith({ documentId: DOCUMENT_ID, creatorTicket: null });
  queryClient.setQueryData(openedDocumentQueryKey(DOCUMENT_ID), openedAs(DocumentRole.Owner, RoomMode.Join));
  renderHookWithRouter(() => useAuthorColorSlots(), { route: documentPagePath(DOCUMENT_ID), queryClient });
  expect(useMembers).toHaveBeenLastCalledWith({ documentId: DOCUMENT_ID, creatorTicket: null });
});
