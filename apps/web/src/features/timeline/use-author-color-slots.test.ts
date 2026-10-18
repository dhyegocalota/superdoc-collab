import { authorColorKeyOf, authorColorSlot, documentPagePath, DocumentRole, type DocumentMember } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { useAuthorColorSlots } from './use-author-color-slots';

const { useMembers } = vi.hoisted(() => ({ useMembers: vi.fn() }));

vi.mock('@/features/editor/use-members', () => ({ useMembers }));

const MEMBER_ID = 'u1';
const MEMBER_SLOT = authorColorSlot(MEMBER_ID) === 6 ? 1 : 6;
const member: DocumentMember = { user: { id: MEMBER_ID, name: 'Ana' }, role: DocumentRole.Editor, online: true, colorSlot: MEMBER_SLOT };

function slotOfAuthor(author: { id: string | null; name: string }) {
  useMembers.mockReturnValue({ members: [member] });
  const { result } = renderHookWithRouter(() => useAuthorColorSlots(), { route: documentPagePath(DOCUMENT_ID) });
  return result.current(author);
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
