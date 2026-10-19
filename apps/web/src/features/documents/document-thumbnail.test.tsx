import { thumbnailApiPath } from '@superdoc-collab/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DocumentThumbnail } from './document-thumbnail';

const TITLE = 'Quarterly plan';
const DOCUMENT_ID = 'doc-1';
const THUMBNAIL_UPDATED_AT = 1_700_000_000_000;
const WITHOUT_IMAGE = { documentId: DOCUMENT_ID, thumbnailUpdatedAt: null };

test('a preview draws its lines on the page and not the title', () => {
  render(<DocumentThumbnail {...WITHOUT_IMAGE} title={TITLE} preview={'First line\nSecond line'} />);
  const page = screen.getByTestId('document-thumbnail');
  expect(page).toHaveAttribute('data-state', 'preview');
  expect(page).toHaveTextContent('First line');
  expect(page).toHaveTextContent('Second line');
  expect(page).not.toHaveTextContent(TITLE);
});

test('no preview draws the page with the title only', () => {
  render(<DocumentThumbnail {...WITHOUT_IMAGE} title={TITLE} preview={null} />);
  const page = screen.getByTestId('document-thumbnail');
  expect(page).toHaveAttribute('data-state', 'title-only');
  expect(page).toHaveTextContent(TITLE);
});

test('an empty preview draws the title page too', () => {
  render(<DocumentThumbnail {...WITHOUT_IMAGE} title={TITLE} preview="" />);
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('data-state', 'title-only');
});

test('the thumbnail is hidden from assistive technology', () => {
  render(<DocumentThumbnail {...WITHOUT_IMAGE} title={TITLE} preview="Body" />);
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('aria-hidden', 'true');
});

test('a stored thumbnail draws the image with the preview as its alternative text', () => {
  render(<DocumentThumbnail documentId={DOCUMENT_ID} title={TITLE} preview="First line" thumbnailUpdatedAt={THUMBNAIL_UPDATED_AT} />);
  const image = screen.getByRole('img', { name: 'First line', hidden: true });
  expect(image).toHaveAttribute('src', thumbnailApiPath({ documentId: DOCUMENT_ID, updatedAt: THUMBNAIL_UPDATED_AT }));
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('decoding', 'async');
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('data-state', 'image');
});

test('a stored thumbnail of a document without a preview is described by the title', () => {
  render(<DocumentThumbnail documentId={DOCUMENT_ID} title={TITLE} preview={null} thumbnailUpdatedAt={THUMBNAIL_UPDATED_AT} />);
  expect(screen.getByRole('img', { name: TITLE, hidden: true })).toBeInTheDocument();
});

test('an image that fails to load falls back to the text preview', () => {
  render(<DocumentThumbnail documentId={DOCUMENT_ID} title={TITLE} preview="First line" thumbnailUpdatedAt={THUMBNAIL_UPDATED_AT} />);
  fireEvent.error(screen.getByRole('img', { name: 'First line', hidden: true }));
  expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('data-state', 'preview');
  expect(screen.getByTestId('document-thumbnail')).toHaveTextContent('First line');
});

test('a new thumbnail version gets another chance after a failed one', () => {
  const { rerender } = render(
    <DocumentThumbnail documentId={DOCUMENT_ID} title={TITLE} preview="First line" thumbnailUpdatedAt={THUMBNAIL_UPDATED_AT} />,
  );
  fireEvent.error(screen.getByRole('img', { name: 'First line', hidden: true }));
  rerender(<DocumentThumbnail documentId={DOCUMENT_ID} title={TITLE} preview="First line" thumbnailUpdatedAt={THUMBNAIL_UPDATED_AT + 1} />);
  expect(screen.getByRole('img', { name: 'First line', hidden: true })).toBeInTheDocument();
});
