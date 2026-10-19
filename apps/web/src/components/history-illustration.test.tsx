import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { HistoryIllustration } from './history-illustration';

test('the illustration is hidden from assistive technology and carries no title', () => {
  const { container } = render(<HistoryIllustration />);
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('title')).toBeNull();
});
