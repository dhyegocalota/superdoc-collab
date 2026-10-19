import {
  ApiPath,
  DocumentRole,
  documentPagePath,
  LINK_COPIED_MESSAGE,
  MINUTE_MS,
  UserRole,
  type DocumentSummary,
} from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { DocumentListKind } from './document-columns';
import { DocumentCard } from './document-card';
import {
  COPY_DOCUMENT_LINK_FAILED_MESSAGE,
  COPY_DOCUMENT_LINK_LABEL,
  documentActionsLabel,
  DOCUMENT_DETAILS_SEPARATOR,
  EDITED_JUST_NOW_LABEL,
  editedAgoLabel,
  OPEN_DOCUMENT_LABEL,
  ROLE_LABELS,
} from './documents-copy';

const NOW = Date.UTC(2026, 9, 19, 12, 0);
const FIVE_MINUTES_MS = 5 * MINUTE_MS;
const SESSION_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const OWNED_DOCUMENT: DocumentSummary = {
  id: 'doc-1',
  title: 'Quarterly plan',
  owner: { id: 'user-1', name: 'Ada' },
  updatedAt: NOW - FIVE_MINUTES_MS,
  role: DocumentRole.Owner,
  preview: 'Opening paragraph',
};
const SHARED_DOCUMENT: DocumentSummary = {
  ...OWNED_DOCUMENT,
  id: 'doc-2',
  owner: { id: 'user-2', name: 'Bruno' },
  role: DocumentRole.Editor,
  preview: null,
};

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    throw new Error(`unexpected request ${String(input)}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  toast.dismiss();
});

test('the card links to the document by its title and draws the thumbnail with the preview', () => {
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  expect(screen.getByRole('link', { name: OWNED_DOCUMENT.title })).toHaveAttribute('href', documentPagePath(OWNED_DOCUMENT.id));
  expect(screen.getByTestId('document-thumbnail')).toHaveTextContent(OWNED_DOCUMENT.preview!);
});

test('a document of Mine names the role and how long ago it was edited', () => {
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  const line = [ROLE_LABELS[DocumentRole.Owner], editedAgoLabel('5 minutes')].join(DOCUMENT_DETAILS_SEPARATOR);
  expect(screen.getByText(line)).toBeInTheDocument();
});

test('a shared document names its owner and a fresh edit reads just now', () => {
  renderWithProviders(<DocumentCard document={{ ...SHARED_DOCUMENT, updatedAt: NOW }} kind={DocumentListKind.Shared} />);
  const line = [SHARED_DOCUMENT.owner.name, EDITED_JUST_NOW_LABEL].join(DOCUMENT_DETAILS_SEPARATOR);
  expect(screen.getByText(line)).toBeInTheDocument();
});

test('a document without a preview draws the title page', () => {
  renderWithProviders(<DocumentCard document={SHARED_DOCUMENT} kind={DocumentListKind.Shared} />);
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('data-state', 'title-only');
});

test('the card is skipped off screen and the More button is at least 44 pixels', () => {
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  expect(screen.getByRole('article')).toHaveClass('[content-visibility:auto]');
  expect(screen.getByRole('button', { name: documentActionsLabel(OWNED_DOCUMENT.title) })).toHaveClass('size-11');
});

test('the More menu opens the document', async () => {
  const { router } = renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  await userEvent.click(screen.getByRole('button', { name: documentActionsLabel(OWNED_DOCUMENT.title) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: OPEN_DOCUMENT_LABEL }));
  expect(router.state.location.pathname).toBe(documentPagePath(OWNED_DOCUMENT.id));
});

test('the More menu copies the absolute link and confirms it', async () => {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  await userEvent.click(screen.getByRole('button', { name: documentActionsLabel(OWNED_DOCUMENT.title) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: COPY_DOCUMENT_LINK_LABEL }));
  expect(writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}${documentPagePath(OWNED_DOCUMENT.id)}`);
  expect(await screen.findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
});

test('a refused copy says so', async () => {
  const writeText = vi.fn(async () => {
    throw new Error('denied');
  });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  await userEvent.click(screen.getByRole('button', { name: documentActionsLabel(OWNED_DOCUMENT.title) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: COPY_DOCUMENT_LINK_LABEL }));
  expect(await screen.findByText(COPY_DOCUMENT_LINK_FAILED_MESSAGE)).toBeInTheDocument();
});
