import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Progress } from './progress';

const INDICATOR_SELECTOR = '[data-slot="progress-indicator"]';

function indicatorOf(bar: HTMLElement): HTMLElement {
  return bar.querySelector<HTMLElement>(INDICATOR_SELECTOR)!;
}

test('a value slides the indicator by the part still to fill', () => {
  render(<Progress value={40} aria-label="Opening" />);
  expect(indicatorOf(screen.getByRole('progressbar')).style.transform).toBe('translateX(-60%)');
});

test('no value leaves the indicator untransformed so it stays inside the track', () => {
  render(<Progress value={null} aria-label="Opening" />);
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('data-state', 'indeterminate');
  expect(indicatorOf(bar).style.transform).toBe('');
});
