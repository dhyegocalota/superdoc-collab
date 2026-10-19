import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DocumentThumbnail } from './document-thumbnail';

const TITLE = 'Quarterly plan';

test('a preview draws its lines on the page and not the title', () => {
  render(<DocumentThumbnail title={TITLE} preview={'First line\nSecond line'} />);
  const page = screen.getByTestId('document-thumbnail');
  expect(page).toHaveAttribute('data-state', 'preview');
  expect(page).toHaveTextContent('First line');
  expect(page).toHaveTextContent('Second line');
  expect(page).not.toHaveTextContent(TITLE);
});

test('no preview draws the page with the title only', () => {
  render(<DocumentThumbnail title={TITLE} preview={null} />);
  const page = screen.getByTestId('document-thumbnail');
  expect(page).toHaveAttribute('data-state', 'title-only');
  expect(page).toHaveTextContent(TITLE);
});

test('an empty preview draws the title page too', () => {
  render(<DocumentThumbnail title={TITLE} preview="" />);
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('data-state', 'title-only');
});

test('the thumbnail is hidden from assistive technology', () => {
  render(<DocumentThumbnail title={TITLE} preview="Body" />);
  expect(screen.getByTestId('document-thumbnail')).toHaveAttribute('aria-hidden', 'true');
});
