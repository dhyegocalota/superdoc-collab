import {
  ApiPath,
  DocumentRole,
  documentPagePath,
  thumbnailApiPath,
  LINK_COPIED_MESSAGE,
  MINUTE_MS,
  UserRole,
  type DocumentSummary,
} from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { DocumentListKind } from './document-columns';
import { DocumentCard } from './document-card';
import { DOCUMENT_DETAILS_SEPARATOR, EDITED_JUST_NOW_LABEL, editedAgoLabel, ROLE_LABELS } from './documents-copy';

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
  thumbnailUpdatedAt: null,
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

test('the card is skipped off screen', () => {
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  expect(screen.getByRole('article')).toHaveClass('[content-visibility:auto]');
});

test('the card has one tap target, the link', () => {
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

test('the card fills its grid cell and reserves two title lines so cards in a row share one height', () => {
  renderWithProviders(<DocumentCard document={OWNED_DOCUMENT} kind={DocumentListKind.Mine} />);
  expect(screen.getByRole('article')).toHaveClass('h-full', 'flex', 'flex-col');
  expect(screen.getByRole('heading', { level: 3 })).toHaveClass('line-clamp-2', 'min-h-[2lh]');
  expect(screen.getByText(/ago|just now/)).toHaveClass('truncate');
});

test('a document with a stored thumbnail draws it on the card with the preview as the alternative text', () => {
  const thumbnailUpdatedAt = NOW - FIVE_MINUTES_MS;
  renderWithProviders(<DocumentCard document={{ ...OWNED_DOCUMENT, thumbnailUpdatedAt }} kind={DocumentListKind.Mine} />);
  const image = screen.getByRole('img', { name: OWNED_DOCUMENT.preview!, hidden: true });
  expect(image).toHaveAttribute('src', thumbnailApiPath({ documentId: OWNED_DOCUMENT.id, updatedAt: thumbnailUpdatedAt }));
});
