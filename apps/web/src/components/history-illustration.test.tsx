import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { HistoryIllustration } from './history-illustration';

const AUTHOR_FILL_CLASSES = ['fill-author-1', 'fill-author-2', 'fill-author-3', 'fill-author-4'];

test('the illustration is hidden from assistive technology and carries no title', () => {
  const { container } = render(<HistoryIllustration />);
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('title')).toBeNull();
});

test.each(AUTHOR_FILL_CLASSES)('the illustration paints with %s', (fillClass) => {
  const { container } = render(<HistoryIllustration />);
  expect(container.querySelector(`.${fillClass}`)).not.toBeNull();
});

test('the illustration uses tokens only and no raster image', () => {
  const { container } = render(<HistoryIllustration />);
  expect(container.querySelector('image')).toBeNull();
  expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
});

test('the illustration forwards its class name', () => {
  const { container } = render(<HistoryIllustration className="hidden lg:block" />);
  expect(container.querySelector('svg')).toHaveClass('hidden', 'lg:block');
});
