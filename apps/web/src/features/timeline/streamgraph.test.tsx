import { TimelineBandKind } from '@superdoc-history/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { FIXTURE_AUTHOR_NAME, timelineWith } from '@/test/timeline-fixtures';
import { Streamgraph } from './streamgraph';
import { STREAMGRAPH_TITLE } from './timeline-copy';
import {
  formatBinRange,
  TooltipAlignment,
  tooltipAlignment,
  tooltipAnchorLeft,
  TOOLTIP_POINTER_OFFSET,
  TOOLTIP_WIDTH,
} from './timeline-tooltip';

const WIDTH = 600;
const timeline = timelineWith({
  volumes: [
    [100, 20, 5],
    [120, 30, 5],
    [120, 40, 5],
  ],
  names: ['Budget', 'Hiring', 'Other'],
  kinds: [TimelineBandKind.Topic, TimelineBandKind.Topic, TimelineBandKind.Other],
});

function renderGraph({
  selectedIndex = 1,
  highlightedBandId = null,
}: { selectedIndex?: number | null; highlightedBandId?: string | null } = {}) {
  const onSelectIndex = vi.fn();
  const onClearSelection = vi.fn();
  const view = render(
    <Streamgraph
      timeline={timeline}
      width={WIDTH}
      selectedIndex={selectedIndex}
      highlightedBandId={highlightedBandId}
      onSelectIndex={onSelectIndex}
      onClearSelection={onClearSelection}
    />,
  );
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

test('the tooltip follows the pointer and aligns inward at the edges', () => {
  const { container } = renderGraph();
  const chart = container.querySelector('svg')!;
  fireEvent.pointerMove(chart, { clientX: 0, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveStyle({ left: '0px', top: `${100 + TOOLTIP_POINTER_OFFSET}px` });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.Start);
  fireEvent.pointerMove(chart, { clientX: WIDTH, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveStyle({ left: `${WIDTH}px` });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.End);
});

function budgetBand(): Element {
  return screen.getByLabelText(/^Budget/);
}

test('focusing a band shows the tooltip of the selected bin and blurring hides it', () => {
  renderGraph({ selectedIndex: 1 });
  fireEvent.focus(budgetBand());
  expect(screen.getByRole('tooltip')).toHaveTextContent(formatBinRange({ start: timeline.bins[1]!.start, binMs: timeline.binMs }));
  fireEvent.blur(budgetBand());
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('focusing a band without a selected bin shows no tooltip', () => {
  renderGraph({ selectedIndex: null });
  fireEvent.focus(budgetBand());
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('the tooltip aligns to the edge it is near', () => {
  expect(tooltipAlignment({ left: 10, chartWidth: WIDTH })).toBe(TooltipAlignment.Start);
  expect(tooltipAlignment({ left: WIDTH / 2, chartWidth: WIDTH })).toBe(TooltipAlignment.Center);
  expect(tooltipAlignment({ left: WIDTH - 10, chartWidth: WIDTH })).toBe(TooltipAlignment.End);
});

test('the first and the last bins open their tooltip inward', () => {
  const { rerender } = renderGraph({ selectedIndex: 0 });
  fireEvent.focus(budgetBand());
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.Start);
  rerender(
    <Streamgraph
      timeline={timeline}
      width={WIDTH}
      selectedIndex={timeline.bins.length - 1}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      onClearSelection={vi.fn()}
    />,
  );
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.End);
});

test('the focused band is described by the tooltip while it shows', () => {
  renderGraph({ selectedIndex: 1 });
  expect(budgetBand()).not.toHaveAttribute('aria-describedby');
  fireEvent.focus(budgetBand());
  expect(budgetBand()).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  fireEvent.blur(budgetBand());
  expect(budgetBand()).not.toHaveAttribute('aria-describedby');
});

test('Escape clears the selection and hides the keyboard tooltip', () => {
  const { rerender, onClearSelection } = renderGraph({ selectedIndex: 1 });
  fireEvent.focus(budgetBand());
  fireEvent.keyDown(budgetBand(), { key: 'Escape' });
  expect(onClearSelection).toHaveBeenCalledTimes(1);
  rerender(
    <Streamgraph
      timeline={timeline}
      width={WIDTH}
      selectedIndex={null}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      onClearSelection={onClearSelection}
    />,
  );
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('the tooltip never grows wider than a narrow chart', () => {
  const narrowWidth = TOOLTIP_WIDTH / 2;
  render(
    <Streamgraph
      timeline={timeline}
      width={narrowWidth}
      selectedIndex={1}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      onClearSelection={vi.fn()}
    />,
  );
  fireEvent.focus(budgetBand());
  expect(screen.getByRole('tooltip')).toHaveStyle({ width: `${narrowWidth}px` });
});

const ALIGNMENT_SHIFT: Record<TooltipAlignment, number> = {
  [TooltipAlignment.Start]: 0,
  [TooltipAlignment.Center]: 0.5,
  [TooltipAlignment.End]: 1,
};

test.each([343, 300, 256, 600])('the tooltip box stays inside a chart %i px wide wherever the bin is', (chartWidth) => {
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, chartWidth);
  Array.from({ length: chartWidth + 1 }, (_, left) => left).forEach((left) => {
    const anchor = tooltipAnchorLeft({ left, chartWidth });
    const boxStart = anchor - tooltipWidth * ALIGNMENT_SHIFT[tooltipAlignment({ left, chartWidth })];
    expect(boxStart).toBeGreaterThanOrEqual(0);
    expect(boxStart + tooltipWidth).toBeLessThanOrEqual(chartWidth);
  });
});
