import {
  ApiPath,
  AppRoute,
  DocumentRole,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  UNTITLED_DOCUMENT_TITLE,
  UserRole,
  type DocumentsList,
  type DocumentSummary,
} from '@superdoc-collab/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { APP_NAME } from '@/lib/app-copy';
import { pageTitle } from '@/lib/use-document-title';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { CONNECTED_APPS_HEADING } from '@/features/connected-apps/connected-apps-copy';
import { ADMIN_LINK_LABEL } from '@/features/admin/admin-copy';
import { COLUMNS_BY_KIND, DocumentListKind } from './document-columns';
import { DOCUMENTS_QUERY_KEY } from './documents-api';
import {
  COLUMN_LABELS,
  CREATE_ERROR_MESSAGE,
  DOCUMENTS_HEADING,
  LOADING_DOCUMENTS_LABEL,
  MINE_EMPTY_MESSAGE,
  NEW_DOCUMENT_LABEL,
  ROLE_LABELS,
  SHARED_EMPTY_MESSAGE,
} from './documents-copy';
import { DocumentsPage } from './documents-page';

const SESSION_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const OWNED_DOCUMENT: DocumentSummary = {
  id: 'doc-1',
  title: 'Quarterly plan',
  owner: { id: 'user-1', name: 'Ada' },
  updatedAt: Date.UTC(2026, 9, 16, 12, 0),
  role: DocumentRole.Owner,
};
const SHARED_DOCUMENT: DocumentSummary = {
  id: 'doc-3',
  title: 'Hiring plan',
  owner: { id: 'user-2', name: 'Bruno' },
  updatedAt: Date.UTC(2026, 9, 16, 13, 0),
  role: DocumentRole.Editor,
};
const CREATED_DOCUMENT: DocumentSummary = { ...OWNED_DOCUMENT, id: 'doc-2', title: UNTITLED_DOCUMENT_TITLE };
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function mockApi(list: DocumentsList, sessionUser = SESSION_USER) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: sessionUser } });
    if (init?.method === HttpMethod.Post) return jsonResponse({ body: CREATED_DOCUMENT, status: HttpStatus.Created });
    return jsonResponse({ body: list });
  });
}

function headersOf(table: HTMLElement): (string | null)[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent);
}

afterEach(() => vi.restoreAllMocks());

test('the header links to the connected apps page', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  const link = await screen.findByRole('link', { name: CONNECTED_APPS_HEADING });
  expect(link).toHaveAttribute('href', AppRoute.ConnectedApps);
});

test('empty lists show both empty messages', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findByText(MINE_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(SHARED_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
});

test('a row of Mine shows the title and the formatted date', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  renderWithProviders(<DocumentsPage />);
  const row = (await screen.findByText(OWNED_DOCUMENT.title)).closest('tr');
  if (!row) throw new Error('row not found');
  expect(within(row).getByText(DATE_FORMAT.format(OWNED_DOCUMENT.updatedAt))).toBeInTheDocument();
});

test('the page names the app and the list, and the tab says Documents', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  expect(screen.getByText(APP_NAME)).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENTS_HEADING })).toBeVisible();
  await waitFor(() => expect(document.title).toBe(pageTitle(DOCUMENTS_HEADING)));
});

test('Mine shows title and date, Shared adds the owner and a readable access label', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [SHARED_DOCUMENT] });
  renderWithProviders(<DocumentsPage />);
  const [mineTable, sharedTable] = await screen.findAllByRole('table');
  expect(headersOf(mineTable!)).toEqual(COLUMNS_BY_KIND[DocumentListKind.Mine].map((column) => COLUMN_LABELS[column]));
  expect(headersOf(sharedTable!)).toEqual(COLUMNS_BY_KIND[DocumentListKind.Shared].map((column) => COLUMN_LABELS[column]));
  expect(within(sharedTable!).getByText(ROLE_LABELS[DocumentRole.Editor])).toBeInTheDocument();
  expect(within(sharedTable!).queryByText(DocumentRole.Editor)).not.toBeInTheDocument();
});

test('the lists show skeleton rows while they load, under the heading', () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    return new Promise<Response>(() => undefined);
  });
  renderWithProviders(<DocumentsPage />);
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENTS_HEADING })).toBeVisible();
  expect(screen.getByRole('status', { name: LOADING_DOCUMENTS_LABEL })).toBeInTheDocument();
});

test('a failed New document shows its alert under the heading, outside the button row', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    if (init?.method === HttpMethod.Post) return new Response(null, { status: HttpStatus.InternalServerError });
    return jsonResponse({ body: { mine: [], shared: [] } });
  });
  renderWithProviders(<DocumentsPage />);
  const button = await screen.findByRole('button', { name: NEW_DOCUMENT_LABEL });
  await userEvent.click(button);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(CREATE_ERROR_MESSAGE);
  expect(button.parentElement).not.toContainElement(alert);
});

test('clicking the title opens the document', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  const { router } = renderWithProviders(<DocumentsPage />);
  await userEvent.click(await screen.findByText(OWNED_DOCUMENT.title));
  expect(router.state.location.pathname).toBe(documentPagePath(OWNED_DOCUMENT.id));
});

test('the title link opens the document from the keyboard with a single navigation', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  const { router } = renderWithProviders(<DocumentsPage />);
  const link = await screen.findByRole('link', { name: OWNED_DOCUMENT.title });
  expect(link).toHaveAttribute('href', documentPagePath(OWNED_DOCUMENT.id));
  const navigateSpy = vi.spyOn(router, 'navigate');
  link.focus();
  await userEvent.keyboard('{Enter}');
  expect(router.state.location.pathname).toBe(documentPagePath(OWNED_DOCUMENT.id));
  expect(navigateSpy).toHaveBeenCalledTimes(1);
});

test('new document posts the untitled title, refreshes the list and opens it', async () => {
  const fetchSpy = mockApi({ mine: [], shared: [] });
  const { queryClient, router } = renderWithProviders(<DocumentsPage />);
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  await userEvent.click(await screen.findByRole('button', { name: NEW_DOCUMENT_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(CREATED_DOCUMENT.id)));
  expect(fetchSpy).toHaveBeenCalledWith(
    ApiPath.Documents,
    expect.objectContaining({ method: HttpMethod.Post, body: JSON.stringify({ title: UNTITLED_DOCUMENT_TITLE }) }),
  );
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DOCUMENTS_QUERY_KEY });
});

test('the header shows the Admin link only for admins', async () => {
  mockApi({ mine: [], shared: [] }, { ...SESSION_USER, role: UserRole.Admin });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findByRole('link', { name: ADMIN_LINK_LABEL })).toHaveAttribute('href', AppRoute.Admin);
});

test('the header has no Admin link for a user', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  await screen.findByText(SESSION_USER.name);
  expect(screen.queryByRole('link', { name: ADMIN_LINK_LABEL })).not.toBeInTheDocument();
});
