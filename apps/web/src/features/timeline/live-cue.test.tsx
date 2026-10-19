import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { LiveCue } from './live-cue';
import { liveEditsLabel } from './timeline-copy';
import type { TimelineChange } from './use-timeline-change';

const CHANGE: TimelineChange = { token: 1, binIndex: 0, bandId: 'band-0' };
const NEXT_CHANGE: TimelineChange = { token: 2, binIndex: 0, bandId: 'band-0' };

test('the dot is decorative and breathes unless motion is reduced', () => {
  const { container, rerender } = render(<LiveCue change={null} />);
  rerender(<LiveCue change={CHANGE} />);
  const dot = container.querySelector('[aria-hidden="true"]')!;
  expect(dot).toHaveClass('live-cue-breath', 'motion-reduce:animate-none');
});

test('a polite live region is there before any edit and says how many new edits came', () => {
  const { container, rerender } = render(<LiveCue change={null} />);
  const region = container.querySelector('[aria-live="polite"]')!;
  expect(region).toHaveTextContent('');
  expect(region).toHaveClass('sr-only');
  rerender(<LiveCue change={CHANGE} />);
  expect(region).toHaveTextContent(liveEditsLabel(1));
});

test('the dot breathes again for every change by remounting', () => {
  const { container, rerender } = render(<LiveCue change={CHANGE} />);
  rerender(<LiveCue change={NEXT_CHANGE} />);
  const first = container.querySelector('[aria-hidden="true"]');
  rerender(<LiveCue change={{ ...NEXT_CHANGE, token: 3 }} />);
  expect(container.querySelector('[aria-hidden="true"]')).not.toBe(first);
});
