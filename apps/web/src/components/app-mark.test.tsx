import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AppMark } from './app-mark';

test('draws a primary tile with a hidden file icon', () => {
  const { container } = render(<AppMark />);
  expect(container.firstElementChild).toHaveClass('size-6', 'rounded-sm', 'bg-primary', 'text-primary-foreground');
  expect(container.querySelector('svg.lucide-file-text')).toHaveAttribute('aria-hidden', 'true');
});

test('a class name replaces the size and the radius', () => {
  const { container } = render(<AppMark className="size-8 rounded-md" />);
  expect(container.firstElementChild).toHaveClass('size-8', 'rounded-md');
  expect(container.firstElementChild).not.toHaveClass('size-6', 'rounded-sm');
});
