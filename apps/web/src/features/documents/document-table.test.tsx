import { ApiPath, DocumentRole, documentPagePath, UserRole, type DocumentSummary } from '@superdoc-collab/types';
import { screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { formatTimestamp } from '@/lib/format-date-time';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { NARROW_VIEWPORT_WIDTH, PHONE_VIEWPORT_WIDTH, stubViewportWidth } from '@/testing/viewport';
import { DocumentListKind } from './document-columns';
import { DocumentTable } from './document-table';
import { DOCUMENT_DETAILS_SEPARATOR, MINE_EMPTY_MESSAGE, ROLE_LABELS } from './documents-copy';

const TIME_ZONE = 'UTC';
const SESSION_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: TIME_ZONE };
const LONG_TITLE = 'Quarterly operating plan for the whole company including every regional office and its hiring forecast';
const SHARED_DOCUMENT: DocumentSummary = {
  id: 'doc-3',
  title: LONG_TITLE,
  owner: { id: 'user-2', name: 'Bruno' },
  updatedAt: Date.UTC(2026, 9, 16, 13, 0),
  role: DocumentRole.Editor,
  preview: null,
  thumbnailUpdatedAt: null,
};
const OWNED_DOCUMENT: DocumentSummary = {
  ...SHARED_DOCUMENT,
  id: 'doc-1',
  title: 'Roadmap',
  owner: { id: 'user-1', name: 'Ada' },
  role: DocumentRole.Owner,
};

function mockSession(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function updatedLabel(document: DocumentSummary): string {
  return formatTimestamp({ time: document.updatedAt, timeZone: TIME_ZONE });
}

afterEach(() => vi.restoreAllMocks());

test('below lg a shared document is a list item with the title link and one muted line', async () => {
  stubViewportWidth(PHONE_VIEWPORT_WIDTH);
  mockSession();
  renderWithProviders(<DocumentTable documents={[SHARED_DOCUMENT]} emptyMessage={MINE_EMPTY_MESSAGE} kind={DocumentListKind.Shared} />);
  const [item] = await screen.findAllByRole('listitem');
  const detailsLine = [SHARED_DOCUMENT.owner.name, updatedLabel(SHARED_DOCUMENT), ROLE_LABELS[SHARED_DOCUMENT.role]].join(
    DOCUMENT_DETAILS_SEPARATOR,
  );
  expect(within(item!).getByRole('link', { name: LONG_TITLE })).toHaveAttribute('href', documentPagePath(SHARED_DOCUMENT.id));
  expect(await within(item!).findByText(detailsLine)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
});

test('below lg a document of Mine shows only the time under the title', async () => {
  stubViewportWidth(NARROW_VIEWPORT_WIDTH);
  mockSession();
  renderWithProviders(<DocumentTable documents={[OWNED_DOCUMENT]} emptyMessage={MINE_EMPTY_MESSAGE} kind={DocumentListKind.Mine} />);
  const [item] = await screen.findAllByRole('listitem');
  expect(await within(item!).findByText(updatedLabel(OWNED_DOCUMENT))).toBeInTheDocument();
});

test('an empty list shows its message at any width', () => {
  stubViewportWidth(PHONE_VIEWPORT_WIDTH);
  mockSession();
  renderWithProviders(<DocumentTable documents={[]} emptyMessage={MINE_EMPTY_MESSAGE} kind={DocumentListKind.Mine} />);
  expect(screen.getByText(MINE_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
