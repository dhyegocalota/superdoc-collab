import {
  authorColorKeyOf,
  authorColorSlot,
  ClientActor,
  documentPagePath,
  DocumentRole,
  type DocumentMember,
} from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FIXTURE_AGENT_AUTHOR_KEY, FIXTURE_AUTHOR_KEY, FIXTURE_AUTHOR_NAME, timelineWith } from '@/testing/timeline-fixtures';
import { AuthorAvatar, ContributorAvatars } from './contributor-avatars';
import { agentMarkLabel, importedAuthorLabel } from './timeline-copy';

const ROUTE = documentPagePath(DOCUMENT_ID);

const { useMembers } = vi.hoisted(() => ({ useMembers: vi.fn() }));

vi.mock('@/features/editor/use-members', () => ({ useMembers }));

const OTHER_MEMBER: DocumentMember = { user: { id: 'other', name: 'Other' }, role: DocumentRole.Editor, online: false, colorSlot: 1 };

beforeEach(() => useMembers.mockReturnValue({ members: [OTHER_MEMBER] }));

function renderAvatars(element: ReactElement) {
  return renderWithProviders(element, { route: ROUTE });
}

const ACCOUNT_AUTHOR = { id: 'u1', name: 'Ana', actor: ClientActor.Human };
const IMPORTED_AUTHOR = { id: null, name: ' Chris Crawford ', actor: ClientActor.Human };

test('AuthorAvatar renders UserAvatar in the author colour, and the imported label for a null id', () => {
  renderAvatars(
    <ul>
      <AuthorAvatar author={ACCOUNT_AUTHOR} />
      <AuthorAvatar author={IMPORTED_AUTHOR} />
    </ul>,
  );
  const account = screen.getByTitle(ACCOUNT_AUTHOR.name);
  expect(account.firstElementChild).toHaveClass(`bg-author-${authorColorSlot('u1')}`, 'size-6');
  const imported = screen.getByTitle(importedAuthorLabel('Chris Crawford'));
  expect(imported.firstElementChild).toHaveClass(`bg-author-${authorColorSlot(authorColorKeyOf(IMPORTED_AUTHOR))}`);
  expect(imported).toHaveTextContent('CC');
});

test('an agent shares its person colour', () => {
  renderAvatars(
    <ul>
      <AuthorAvatar author={{ ...ACCOUNT_AUTHOR, id: 'u1#agent', actor: ClientActor.Agent }} />
    </ul>,
  );
  expect(screen.getByTitle(ACCOUNT_AUTHOR.name).firstElementChild).toHaveClass(`bg-author-${authorColorSlot('u1')}`);
});

const { authors } = timelineWith({ volumes: [[1]], names: ['Budget'] });
const contributor = { inserted: 10, deleted: 0, wordsInserted: 2, wordsDeleted: 0 };

test('a human author shows no AI badge', () => {
  renderAvatars(<ContributorAvatars authors={authors} contributors={[{ authorKey: FIXTURE_AUTHOR_KEY, ...contributor }]} />);
  expect(screen.getByTitle(FIXTURE_AUTHOR_NAME)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('an agent author shows the AI badge and keeps the human initials', () => {
  renderAvatars(<ContributorAvatars authors={authors} contributors={[{ authorKey: FIXTURE_AGENT_AUTHOR_KEY, ...contributor }]} />);
  const avatar = screen.getByTitle(FIXTURE_AUTHOR_NAME);
  expect(authors[FIXTURE_AGENT_AUTHOR_KEY]!.actor).toBe(ClientActor.Agent);
  expect(avatar).toContainElement(screen.getByRole('img', { name: agentMarkLabel(FIXTURE_AUTHOR_NAME) }));
  expect(avatar).toHaveTextContent(/^A/);
});

test('a human whose name looks like an AI shows no AI icon', () => {
  const lookalike = { bob: { id: 'user-2', name: 'Bob · AI', actor: ClientActor.Human } };
  renderAvatars(<ContributorAvatars authors={lookalike} contributors={[{ authorKey: 'bob', ...contributor }]} />);
  expect(screen.getByTitle('Bob · AI')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('an author who is a member takes the slot the server assigned', () => {
  const memberSlot = authorColorSlot('u1') === 6 ? 1 : 6;
  const member: DocumentMember = { user: { id: 'u1', name: 'Ana' }, role: DocumentRole.Editor, online: true, colorSlot: memberSlot };
  useMembers.mockReturnValue({ members: [member] });
  renderAvatars(
    <ul>
      <AuthorAvatar author={ACCOUNT_AUTHOR} />
    </ul>,
  );
  expect(screen.getByTitle(ACCOUNT_AUTHOR.name).firstElementChild).toHaveClass(`bg-author-${memberSlot}`);
});

test('before the members answer an avatar is neutral, never the hash colour', () => {
  useMembers.mockReturnValue({ members: [] });
  renderAvatars(
    <ul>
      <AuthorAvatar author={ACCOUNT_AUTHOR} />
    </ul>,
  );
  const swatch = screen.getByTitle(ACCOUNT_AUTHOR.name).firstElementChild;
  expect(swatch).toHaveClass('bg-muted', 'text-muted-foreground');
  expect(swatch?.className).not.toMatch(/bg-author-/);
});
