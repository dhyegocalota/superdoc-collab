import { ApiPath, DocumentRole, documentPagePath, HttpMethod, HttpStatus, UNTITLED_DOCUMENT_TITLE, type DocumentsList, type DocumentSummary } from '@superdoc-history/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/render-with-providers';
import { DOCUMENTS_QUERY_KEY } from './documents-api';
import { MINE_EMPTY_MESSAGE, NEW_DOCUMENT_LABEL, SHARED_EMPTY_MESSAGE } from './documents-copy';
import { DocumentsPage } from './documents-page';

const DOCUMENTS_PATH = '/documents';
const SESSION_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };
const OWNED_DOCUMENT: DocumentSummary = { id: 'doc-1', title: 'Quarterly plan', owner: { id: 'user-1', name: 'Ada' }, updatedAt: Date.UTC(2026, 9, 16, 12, 0), role: DocumentRole.Owner };
const CREATED_DOCUMENT: DocumentSummary = { ...OWNED_DOCUMENT, id: 'doc-2', title: UNTITLED_DOCUMENT_TITLE };
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function mockApi(list: DocumentsList) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    if (init?.method === HttpMethod.Post) return new Response(JSON.stringify(CREATED_DOCUMENT), { status: HttpStatus.Created });
    return new Response(JSON.stringify(list));
  });
}

afterEach(() => vi.restoreAllMocks());

test('empty lists show both empty messages', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findByText(MINE_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(SHARED_EMPTY_MESSAGE)).toBeInTheDocument();
});

test('a row shows the title, owner, formatted date and role', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  renderWithProviders(<DocumentsPage />);
  const row = (await screen.findByText(OWNED_DOCUMENT.title)).closest('tr');
  if (!row) throw new Error('row not found');
  expect(within(row).getByText(OWNED_DOCUMENT.owner.name)).toBeInTheDocument();
  expect(within(row).getByText(DATE_FORMAT.format(OWNED_DOCUMENT.updatedAt))).toBeInTheDocument();
  expect(within(row).getByText(DocumentRole.Owner)).toBeInTheDocument();
});

test('clicking a row opens the document', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  const { router } = renderWithProviders(<DocumentsPage />);
  await userEvent.click(await screen.findByText(OWNED_DOCUMENT.title));
  expect(router.state.location.pathname).toBe(documentPagePath(OWNED_DOCUMENT.id));
});

test('a row title is a link reachable and activated by keyboard', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  const { router } = renderWithProviders(<DocumentsPage />);
  const link = await screen.findByRole('link', { name: OWNED_DOCUMENT.title });
  expect(link).toHaveAttribute('href', documentPagePath(OWNED_DOCUMENT.id));
  link.focus();
  await userEvent.keyboard('{Enter}');
  expect(router.state.location.pathname).toBe(documentPagePath(OWNED_DOCUMENT.id));
  await router.navigate(-1);
  expect(router.state.location.pathname).toBe(DOCUMENTS_PATH);
});

test('new document posts the untitled title, refreshes the list and opens it', async () => {
  const fetchSpy = mockApi({ mine: [], shared: [] });
  const { queryClient, router } = renderWithProviders(<DocumentsPage />);
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  await userEvent.click(await screen.findByRole('button', { name: NEW_DOCUMENT_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(CREATED_DOCUMENT.id)));
  expect(fetchSpy).toHaveBeenCalledWith(ApiPath.Documents, expect.objectContaining({ method: HttpMethod.Post, body: JSON.stringify({ title: UNTITLED_DOCUMENT_TITLE }) }));
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DOCUMENTS_QUERY_KEY });
});
