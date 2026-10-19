import {
  ApiPath,
  DocumentRole,
  DOCX_MIME_TYPE,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  UNTITLED_DOCUMENT_TITLE,
  UserRole,
  type DocumentsList,
  type DocumentSummary,
} from '@superdoc-collab/types';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { APP_NAME } from '@/lib/app-copy';
import { pageTitle } from '@/lib/use-document-title';
import { formatTimestamp } from '@/lib/format-date-time';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { stubViewportWidth, WIDE_VIEWPORT_WIDTH } from '@/testing/viewport';
import { accountMenuLabel } from '@/features/account/account-copy';
import { SIGN_OUT_LABEL } from '@/features/auth/auth-copy';
import { LIBRARY_PROMPTS, USE_WITH_AI_LABEL, USE_WITH_AI_TITLE } from '@/features/connected-apps/connected-apps-copy';
import { COLUMNS_BY_KIND, DocumentListKind } from './document-columns';
import { DOCUMENTS_QUERY_KEY } from './documents-api';
import {
  COLUMN_LABELS,
  CARDS_VIEW_LABEL,
  CREATE_ERROR_MESSAGE,
  DOCUMENTS_HEADING,
  DROP_OVERLAY_LABEL,
  DROP_ZONE_LABEL,
  EMPTY_STATE_HEADING,
  LOADING_DOCUMENTS_LABEL,
  MINE_EMPTY_MESSAGE,
  NEW_DOCUMENT_LABEL,
  ONE_FILE_AT_A_TIME_MESSAGE,
  ROLE_LABELS,
  SHARED_EMPTY_MESSAGE,
  TABLE_VIEW_LABEL,
  UPLOAD_LABEL,
} from './documents-copy';
import { DocumentsPage } from './documents-page';
import { DOCUMENTS_VIEW_STORAGE_KEY, DocumentsView } from './use-documents-view';

const SESSION_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const OWNED_DOCUMENT: DocumentSummary = {
  id: 'doc-1',
  title: 'Quarterly plan',
  owner: { id: 'user-1', name: 'Ada' },
  updatedAt: Date.UTC(2026, 9, 16, 12, 0),
  role: DocumentRole.Owner,
  preview: null,
};
const SHARED_DOCUMENT: DocumentSummary = {
  id: 'doc-3',
  title: 'Hiring plan',
  owner: { id: 'user-2', name: 'Bruno' },
  updatedAt: Date.UTC(2026, 9, 16, 13, 0),
  role: DocumentRole.Editor,
  preview: null,
};
const CREATED_DOCUMENT: DocumentSummary = { ...OWNED_DOCUMENT, id: 'doc-2', title: UNTITLED_DOCUMENT_TITLE };

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

beforeEach(() => {
  localStorage.clear();
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
});

afterEach(() => vi.restoreAllMocks());

test('the header holds Use with AI and the account menu only, with no Sign out button, and Upload is the primary action', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  renderWithProviders(<DocumentsPage />);
  const header = screen.getByRole('banner');
  expect(await within(header).findByRole('button', { name: accountMenuLabel(SESSION_USER.name) })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: USE_WITH_AI_LABEL })).toBeInTheDocument();
  expect(within(header).getAllByRole('link')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: SIGN_OUT_LABEL })).not.toBeInTheDocument();
  const upload = await screen.findByRole('button', { name: UPLOAD_LABEL });
  expect(upload).toHaveClass('bg-primary');
  expect(screen.getByRole('button', { name: NEW_DOCUMENT_LABEL })).not.toHaveClass('bg-primary');
});

test('Use with AI opens the dialog with the library prompts', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  await userEvent.click(await screen.findByRole('button', { name: USE_WITH_AI_LABEL }));
  const dialog = await screen.findByRole('dialog', { name: USE_WITH_AI_TITLE });
  expect(
    within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(LIBRARY_PROMPTS);
});

test('empty lists show the empty state instead of the tables', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findByRole('heading', { name: EMPTY_STATE_HEADING })).toBeVisible();
  expect(screen.getByText(DROP_ZONE_LABEL)).toBeVisible();
  expect(screen.queryByText(MINE_EMPTY_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByText(SHARED_EMPTY_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: UPLOAD_LABEL })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: NEW_DOCUMENT_LABEL })).toHaveLength(1);
});

test('one shared document is enough to keep the tables and drop the empty state', async () => {
  mockApi({ mine: [], shared: [SHARED_DOCUMENT] });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findByText(MINE_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: EMPTY_STATE_HEADING })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: UPLOAD_LABEL })).toBeInTheDocument();
});

test('dropping one docx on the page uploads it and opens the document', async () => {
  const fetchSpy = mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  const { router } = renderWithProviders(<DocumentsPage />);
  await screen.findByRole('link', { name: OWNED_DOCUMENT.title });
  const file = new File(['x'], 'plan.docx', { type: DOCX_MIME_TYPE });
  fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files: [file] } });
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(CREATED_DOCUMENT.id)));
  expect(fetchSpy).toHaveBeenCalledWith(ApiPath.Documents, expect.objectContaining({ method: HttpMethod.Post }));
});

test('dropping two files on a page with documents shows the message under the toolbar', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  renderWithProviders(<DocumentsPage />);
  await screen.findByRole('link', { name: OWNED_DOCUMENT.title });
  const files = [new File(['x'], 'a.docx'), new File(['x'], 'b.docx')];
  fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files } });
  expect(await screen.findByRole('alert')).toHaveTextContent(ONE_FILE_AT_A_TIME_MESSAGE);
});

test('dragging a file over the empty page shows the overlay', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  await screen.findByRole('heading', { name: EMPTY_STATE_HEADING });
  fireEvent.dragEnter(document.body, { dataTransfer: { types: ['Files'], files: [] } });
  expect(screen.getByText(DROP_OVERLAY_LABEL)).toBeVisible();
});

test('a row of Mine shows the title and the formatted date', async () => {
  localStorage.setItem(DOCUMENTS_VIEW_STORAGE_KEY, DocumentsView.Table);
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  renderWithProviders(<DocumentsPage />);
  const row = (await screen.findByText(OWNED_DOCUMENT.title)).closest('tr');
  if (!row) throw new Error('row not found');
  expect(
    await within(row).findByText(formatTimestamp({ time: OWNED_DOCUMENT.updatedAt, timeZone: SESSION_USER.timeZone })),
  ).toBeInTheDocument();
});

test('the page names the app and the list, and the tab says Documents', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  expect(screen.getByText(APP_NAME)).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENTS_HEADING })).toBeVisible();
  await waitFor(() => expect(document.title).toBe(pageTitle(DOCUMENTS_HEADING)));
});

test('Mine shows title and date, Shared adds the owner and a readable access label', async () => {
  localStorage.setItem(DOCUMENTS_VIEW_STORAGE_KEY, DocumentsView.Table);
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
  await userEvent.click(await screen.findByRole('link', { name: OWNED_DOCUMENT.title }));
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

test('the home opens in cards, one card per document in Mine and Shared, with no table', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [SHARED_DOCUMENT] });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findAllByRole('article')).toHaveLength(2);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: CARDS_VIEW_LABEL })).toBeChecked();
});

test('the cards grid is one column, two from sm, three from lg and four from xl', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [] });
  renderWithProviders(<DocumentsPage />);
  const grid = await screen.findByTestId('document-cards');
  expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4');
});

test('an empty list shows its message in cards too', async () => {
  mockApi({ mine: [], shared: [SHARED_DOCUMENT] });
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findByText(MINE_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

test('the toggle switches both lists to the table and the choice is kept for the next visit', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [SHARED_DOCUMENT] });
  renderWithProviders(<DocumentsPage />);
  await userEvent.click(await screen.findByRole('radio', { name: TABLE_VIEW_LABEL }));
  expect(screen.getAllByRole('table')).toHaveLength(2);
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(localStorage.getItem(DOCUMENTS_VIEW_STORAGE_KEY)).toBe(DocumentsView.Table);
  cleanup();
  renderWithProviders(<DocumentsPage />);
  expect(await screen.findAllByRole('table')).toHaveLength(2);
});
