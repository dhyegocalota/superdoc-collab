import { TimelineBandKind } from '@superdoc-history/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { FIXTURE_AUTHOR_NAME, timelineWith } from '@/test/timeline-fixtures';
import { Streamgraph } from './streamgraph';
import { STREAMGRAPH_TITLE } from './timeline-copy';
import { formatBinRange } from './timeline-tooltip';

const WIDTH = 600;
const timeline = timelineWith({
  volumes: [[100, 20, 5], [120, 30, 5], [120, 40, 5]],
  names: ['Budget', 'Hiring', 'Other'],
  kinds: [TimelineBandKind.Topic, TimelineBandKind.Topic, TimelineBandKind.Other],
});

function renderGraph({ selectedIndex = 1, highlightedBandId = null }: { selectedIndex?: number | null; highlightedBandId?: string | null } = {}) {
  const onSelectIndex = vi.fn();
  const onClearSelection = vi.fn();
  const view = render(<Streamgraph timeline={timeline} width={WIDTH} selectedIndex={selectedIndex} highlightedBandId={highlightedBandId} onSelectIndex={onSelectIndex} onClearSelection={onClearSelection} />);
  return { ...view, onSelectIndex, onClearSelection };
}

test('the svg is titled and described with the band count and the time range', () => {
  const { container } = renderGraph();
  expect(container.querySelector('title')!.textContent).toBe(STREAMGRAPH_TITLE);
  const description = container.querySelector('desc')!.textContent!;
  expect(description).toContain('3 bands');
  expect(description).toContain(formatBinRange({ start: timeline.bins[0]!.start, binMs: timeline.binMs }).split(' – ')[0]!);
});

test('every band is a focusable path labelled with its size', () => {
  renderGraph();
  const band = screen.getByLabelText('Budget, 340 characters');
  expect(band.tagName.toLowerCase()).toBe('path');
  expect(band).toHaveAttribute('tabindex', '0');
  expect(band).toHaveClass('topic-band');
  expect(screen.getByLabelText('Other, 15 characters')).toHaveClass('topic-band-other');
});

test('arrow keys, End and Escape drive the selection', () => {
  const { onSelectIndex, onClearSelection } = renderGraph({ selectedIndex: 1 });
  const band = screen.getByLabelText('Budget, 340 characters');
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  expect(onSelectIndex).toHaveBeenLastCalledWith(2);
  fireEvent.keyDown(band, { key: 'End' });
  expect(onSelectIndex).toHaveBeenLastCalledWith(2);
  fireEvent.keyDown(band, { key: 'Escape' });
  expect(onClearSelection).toHaveBeenCalledTimes(1);
});

test('ArrowLeft at the first bin stays at the first bin', () => {
  const { onSelectIndex } = renderGraph({ selectedIndex: 0 });
  fireEvent.keyDown(screen.getByLabelText('Budget, 340 characters'), { key: 'ArrowLeft' });
  expect(onSelectIndex).toHaveBeenLastCalledWith(0);
});

test('pressing the chart selects the bin under the pointer', () => {
  const { container, onSelectIndex } = renderGraph();
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: WIDTH, buttons: 1 });
  expect(onSelectIndex).toHaveBeenLastCalledWith(2);
});

test('hovering a bin shows its range, bands, sizes and contributors', () => {
  const { container } = renderGraph();
  fireEvent.pointerMove(container.querySelector('svg')!, { clientX: WIDTH / 2, buttons: 0 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent(formatBinRange({ start: timeline.bins[1]!.start, binMs: timeline.binMs }));
  expect(tooltip).toHaveTextContent('Budget');
  expect(tooltip).toHaveTextContent('+120 −0');
  expect(tooltip).toHaveTextContent(FIXTURE_AUTHOR_NAME);
  fireEvent.pointerLeave(container.querySelector('svg')!);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a highlighted band keeps full opacity while the others fade', () => {
  renderGraph({ highlightedBandId: timeline.bands[0]!.id });
  expect(screen.getByLabelText('Budget, 340 characters')).not.toHaveClass('opacity-40');
  expect(screen.getByLabelText('Hiring, 90 characters')).toHaveClass('opacity-40');
});
