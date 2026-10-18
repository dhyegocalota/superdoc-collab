import { AgentActionKind, TimelineBandKind, UTC_TIME_ZONE } from '@superdoc-collab/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { FIXTURE_AGENT_AUTHOR_KEY, FIXTURE_AGENT_AUTHOR_NAME, FIXTURE_AUTHOR_NAME, timelineWith } from '@/testing/timeline-fixtures';
import { formatBinMoment, formatBinRange, formatTimestamp } from '@/lib/format-date-time';
import { Streamgraph } from './streamgraph';
import { layoutStreamgraph } from './streamgraph-layout';
import {
  AGENT_ACTION_LABELS,
  AGENT_LEGEND_LABEL,
  agentActionLabel,
  agentMarkLabel,
  CHART_HINT,
  LEGEND_LABEL,
  STREAMGRAPH_TITLE,
} from './timeline-copy';
import { TooltipAlignment, tooltipAlignment, tooltipAnchorLeft, TOOLTIP_POINTER_OFFSET, TOOLTIP_WIDTH } from './timeline-tooltip';

vi.mock('@/lib/use-time-zone', () => ({ useTimeZone: () => ({ timeZone: 'UTC', source: 'account' }) }));

const WIDTH = 600;
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const WHITESPACE = /\s+/g;
const timeline = timelineWith({
  volumes: [
    [100, 20, 5],
    [120, 30, 5],
    [120, 40, 5],
  ],
  names: ['Budget', 'Hiring', 'Other'],
  kinds: [TimelineBandKind.Topic, TimelineBandKind.Topic, TimelineBandKind.Other],
});

function asRendered(text: string): string {
  return text.replace(WHITESPACE, ' ');
}

function renderGraph({
  selectedIndex = 1,
  highlightedBandId = null,
  isLoadingVersion = false,
}: { selectedIndex?: number | null; highlightedBandId?: string | null; isLoadingVersion?: boolean } = {}) {
  const onSelectIndex = vi.fn();
  const onClearSelection = vi.fn();
  const view = render(
    <Streamgraph
      timeline={timeline}
      width={WIDTH}
      selectedIndex={selectedIndex}
      highlightedBandId={highlightedBandId}
      onSelectIndex={onSelectIndex}
      isLoadingVersion={isLoadingVersion}
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
  expect(description).toContain(formatTimestamp({ time: timeline.bins[0]!.start, timeZone: UTC_TIME_ZONE }));
});

test('every band is a path labelled with its size and only the first is in the tab order', () => {
  renderGraph();
  const budget = screen.getByLabelText('Budget, 340 characters');
  const other = screen.getByLabelText('Other, 15 characters');
  [budget, other].forEach((band) => expect(band.tagName.toLowerCase()).toBe('path'));
  expect(budget).toHaveAttribute('tabindex', '0');
  expect(other).toHaveAttribute('tabindex', '-1');
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

test('taps are ignored while a version loads and the chart is busy', () => {
  const { container, onSelectIndex } = renderGraph({ isLoadingVersion: true });
  const chart = container.querySelector('svg')!;
  fireEvent.pointerDown(chart, { clientX: WIDTH, buttons: 1 });
  fireEvent.pointerMove(chart, { clientX: 0, buttons: 1 });
  expect(onSelectIndex).not.toHaveBeenCalled();
  expect(chart.parentElement).toHaveAttribute('aria-busy', 'true');
});

test('taps select and the chart is not busy once no version loads', () => {
  const { container, onSelectIndex } = renderGraph({ isLoadingVersion: false });
  const chart = container.querySelector('svg')!;
  fireEvent.pointerDown(chart, { clientX: WIDTH, buttons: 1 });
  expect(onSelectIndex).toHaveBeenLastCalledWith(2);
  expect(chart.parentElement).toHaveAttribute('aria-busy', 'false');
});

test('keys still move the selection while a version loads', () => {
  const { onSelectIndex } = renderGraph({ selectedIndex: 1, isLoadingVersion: true });
  fireEvent.keyDown(budgetBand(), { key: 'ArrowRight' });
  expect(onSelectIndex).toHaveBeenLastCalledWith(2);
});

test('a drag inside the selected bin selects nothing and a drag into another bin selects it', () => {
  const { container, onSelectIndex } = renderGraph({ selectedIndex: 1 });
  const chart = container.querySelector('svg')!;
  fireEvent.pointerMove(chart, { clientX: WIDTH / 2, buttons: 1 });
  expect(onSelectIndex).not.toHaveBeenCalled();
  fireEvent.pointerMove(chart, { clientX: WIDTH, buttons: 1 });
  expect(onSelectIndex).toHaveBeenCalledExactlyOnceWith(2);
});

test('hovering a bin shows its range, bands, sizes and contributors', () => {
  const { container } = renderGraph();
  fireEvent.pointerMove(container.querySelector('svg')!, { clientX: WIDTH / 2, buttons: 0 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent(asRendered(formatBinRange({ ...timeline.bins[1]!, binMs: timeline.binMs, timeZone: UTC_TIME_ZONE })));
  expect(tooltip).toHaveTextContent('Budget');
  expect(tooltip).toHaveTextContent('+120 characters');
  expect(tooltip).not.toHaveTextContent('−0');
  expect(tooltip).toHaveTextContent(FIXTURE_AUTHOR_NAME);
  fireEvent.pointerLeave(container.querySelector('svg')!);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a highlighted band keeps full opacity while the others fade', () => {
  renderGraph({ highlightedBandId: timeline.bands[0]!.id });
  expect(screen.getByLabelText('Budget, 340 characters')).toHaveAttribute('data-faded', 'false');
  expect(screen.getByLabelText('Hiring, 90 characters')).toHaveAttribute('data-faded', 'true');
});

test('the tooltip follows the pointer, aligns inward at the edges and centres in the middle', () => {
  const { container } = renderGraph();
  const chart = container.querySelector('svg')!;
  fireEvent.pointerMove(chart, { clientX: 0, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveStyle({ left: '0px', top: `${100 + TOOLTIP_POINTER_OFFSET}px` });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.Start);
  fireEvent.pointerMove(chart, { clientX: WIDTH / 2, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.Center);
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
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    asRendered(formatBinRange({ ...timeline.bins[1]!, binMs: timeline.binMs, timeZone: UTC_TIME_ZONE })),
  );
  fireEvent.blur(budgetBand());
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('focusing a band without a selected bin shows no tooltip', () => {
  renderGraph({ selectedIndex: null });
  fireEvent.focus(budgetBand());
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
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
      isLoadingVersion={false}
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
      isLoadingVersion={false}
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

const LABELLED_TIMELINE = timelineWith({ volumes: Array.from({ length: 60 }, () => [400, 300]), names: ['Budget', 'Hiring'] });

test('the chart shows its first and last moment and how to travel in time', () => {
  renderGraph();
  expect(
    screen.getByText(formatBinMoment({ time: timeline.bins[0]!.start, binMs: timeline.binMs, timeZone: UTC_TIME_ZONE })),
  ).toBeVisible();
  expect(screen.getByText(formatBinMoment({ time: timeline.bins[2]!.end, binMs: timeline.binMs, timeZone: UTC_TIME_ZONE }))).toBeVisible();
  expect(screen.getByText(CHART_HINT)).toBeVisible();
});

test('bands without a label are named in a legend', () => {
  renderGraph();
  const legend = screen.getByRole('list', { name: LEGEND_LABEL });
  expect(
    within(legend)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Budget', 'Hiring', 'Other']);
});

test('a chart whose bands all carry their label has no legend', () => {
  render(
    <Streamgraph
      timeline={LABELLED_TIMELINE}
      width={WIDTH}
      selectedIndex={null}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      isLoadingVersion={false}
      onClearSelection={vi.fn()}
    />,
  );
  expect(screen.queryByRole('list', { name: LEGEND_LABEL })).not.toBeInTheDocument();
});

test('a pointer selection does not pin the tooltip, the next arrow key shows it', () => {
  const { container } = renderGraph({ selectedIndex: 1 });
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: WIDTH / 2, buttons: 1 });
  fireEvent.focus(budgetBand());
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.keyDown(budgetBand(), { key: 'ArrowRight' });
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
});

test('the chart is one tab stop on the active band', () => {
  const { container, rerender } = renderGraph();
  expect(container.querySelectorAll('path[tabindex="0"]')).toHaveLength(1);
  expect(budgetBand()).toHaveAttribute('tabindex', '0');
  expect(screen.getByLabelText(/^Other/)).toHaveAttribute('tabindex', '-1');
  rerender(
    <Streamgraph
      timeline={timeline}
      width={WIDTH}
      selectedIndex={1}
      highlightedBandId={timeline.bands[1]!.id}
      onSelectIndex={vi.fn()}
      isLoadingVersion={false}
      onClearSelection={vi.fn()}
    />,
  );
  expect(screen.getByLabelText(/^Hiring/)).toHaveAttribute('tabindex', '0');
  expect(budgetBand()).toHaveAttribute('tabindex', '-1');
});

test('a press that focuses no band leaves the next keyboard focus its tooltip', () => {
  const { container } = renderGraph({ selectedIndex: 1 });
  const chart = container.querySelector('svg')!;
  fireEvent.pointerDown(chart, { clientX: WIDTH / 2, buttons: 1 });
  fireEvent.pointerUp(chart);
  fireEvent.focus(budgetBand());
  expect(budgetBand()).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
});

test('a click after arrow keys hands the tooltip back to the pointer', () => {
  const { container } = renderGraph({ selectedIndex: 1 });
  const chart = container.querySelector('svg')!;
  fireEvent.focus(budgetBand());
  fireEvent.keyDown(budgetBand(), { key: 'ArrowRight' });
  fireEvent.pointerDown(chart, { clientX: WIDTH / 2, buttons: 1 });
  fireEvent.pointerUp(chart);
  fireEvent.pointerLeave(chart);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test.each([
  { key: 'ArrowRight', expected: 0 },
  { key: 'ArrowLeft', expected: 2 },
  { key: 'Home', expected: 0 },
  { key: 'End', expected: 2 },
])('$key without a selection selects bin $expected', ({ key, expected }) => {
  const { onSelectIndex } = renderGraph({ selectedIndex: null });
  fireEvent.keyDown(screen.getByLabelText('Budget, 340 characters'), { key });
  expect(onSelectIndex).toHaveBeenLastCalledWith(expected);
});

test('another key selects nothing', () => {
  const { onSelectIndex } = renderGraph({ selectedIndex: 1 });
  fireEvent.keyDown(screen.getByLabelText('Budget, 340 characters'), { key: 'a' });
  expect(onSelectIndex).not.toHaveBeenCalled();
});

const AGENT_SELECTOR = '[data-actor="agent"]';
const agentTimeline = timelineWith({
  volumes: [
    [100, 20],
    [120, 30],
    [120, 40],
  ],
  names: ['Budget', 'Hiring'],
  agentVolumes: [
    [0, 0],
    [60, 0],
    [30, 0],
  ],
});

function renderAgentGraph() {
  return render(
    <Streamgraph
      timeline={agentTimeline}
      width={WIDTH}
      selectedIndex={1}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      isLoadingVersion={false}
      onClearSelection={vi.fn()}
    />,
  );
}

test('a band with agent volume renders a hatched agent layer and no other band does', () => {
  const { container } = renderAgentGraph();
  const layers = container.querySelectorAll(AGENT_SELECTOR);
  expect(layers).toHaveLength(1);
  const patternId = container.querySelector('defs pattern')!.id;
  expect(layers[0]).toHaveAttribute('fill', `url(#${patternId})`);
  expect(container.querySelectorAll('defs pattern')).toHaveLength(1);
});

test('no agent volume renders no agent layer, no pattern and no legend row', () => {
  const { container } = renderGraph();
  expect(container.querySelector(AGENT_SELECTOR)).toBeNull();
  expect(container.querySelector('defs pattern')).toBeNull();
  expect(screen.queryByText(AGENT_LEGEND_LABEL)).not.toBeInTheDocument();
});

test('agent volume adds the hatched legend row', () => {
  renderAgentGraph();
  expect(screen.getByText(AGENT_LEGEND_LABEL)).toBeInTheDocument();
});

test('the tooltip marks the agent author with the AI icon, by the plain name', () => {
  const { container } = renderAgentGraph();
  fireEvent.pointerMove(container.querySelector('svg')!, { clientX: WIDTH / 2, buttons: 0 });
  const tooltip = screen.getByRole('tooltip');
  expect(within(tooltip).getAllByRole('img', { name: agentMarkLabel(FIXTURE_AGENT_AUTHOR_NAME) })).toHaveLength(1);
  expect(tooltip).not.toHaveTextContent('· AI');
});

const ACTION_KINDS = [AgentActionKind.ShareLinkRotated, AgentActionKind.DocumentExported];
const actionTimeline = timelineWith({
  volumes: [
    [100, 20],
    [120, 30],
    [120, 40],
  ],
  names: ['Budget', 'Hiring'],
  agentActions: ACTION_KINDS.map((kind, index) => ({
    authorKey: FIXTURE_AGENT_AUTHOR_KEY,
    kind,
    createdAt: timeline.bins[index]!.start + index * 1000,
  })),
});

function renderActionGraph(source = actionTimeline) {
  return render(
    <Streamgraph
      timeline={source}
      width={WIDTH}
      selectedIndex={null}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      isLoadingVersion={false}
      onClearSelection={vi.fn()}
    />,
  );
}

test('every agent action is one mark and hovering it names the action', () => {
  renderActionGraph();
  const marks = ACTION_KINDS.map((kind) => screen.getByRole('img', { name: agentActionLabel({ name: FIXTURE_AGENT_AUTHOR_NAME, kind }) }));
  expect(marks).toHaveLength(ACTION_KINDS.length);
  fireEvent.pointerEnter(marks[0]!);
  expect(screen.getByRole('tooltip')).toHaveTextContent(`${FIXTURE_AGENT_AUTHOR_NAME}'s AI ${AGENT_ACTION_LABELS[ACTION_KINDS[0]!]}`);
  fireEvent.pointerLeave(marks[0]!);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('focusing a mark shows its tooltip and blurring hides it', () => {
  renderActionGraph();
  const mark = screen.getByRole('img', { name: agentActionLabel({ name: FIXTURE_AGENT_AUTHOR_NAME, kind: ACTION_KINDS[1]! }) });
  fireEvent.focus(mark);
  expect(screen.getByRole('tooltip')).toHaveTextContent(AGENT_ACTION_LABELS[ACTION_KINDS[1]!]);
  fireEvent.blur(mark);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a timeline without agent actions renders no marks', () => {
  renderGraph();
  expect(screen.queryByRole('img', { name: new RegExp(AGENT_ACTION_LABELS[AgentActionKind.ShareLinkRotated]) })).not.toBeInTheDocument();
});

test('a mark is a focusable image with the tooltip as its description, not a button', () => {
  renderActionGraph();
  const mark = screen.getByRole('img', { name: agentActionLabel({ name: FIXTURE_AGENT_AUTHOR_NAME, kind: ACTION_KINDS[0]! }) });
  expect(mark).toHaveAttribute('tabindex', '0');
  fireEvent.focus(mark);
  expect(mark).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  expect(screen.queryByRole('button', { name: /share link|exported/ })).not.toBeInTheDocument();
});

test('a tooltip for an action that disappears is gone with it', () => {
  const view = renderActionGraph();
  const mark = screen.getByRole('img', { name: agentActionLabel({ name: FIXTURE_AGENT_AUTHOR_NAME, kind: ACTION_KINDS[0]! }) });
  fireEvent.pointerEnter(mark);
  view.rerender(
    <Streamgraph
      timeline={{ ...actionTimeline, agentActions: actionTimeline.agentActions.slice(1) }}
      width={WIDTH}
      selectedIndex={null}
      highlightedBandId={null}
      onSelectIndex={vi.fn()}
      isLoadingVersion={false}
      onClearSelection={vi.fn()}
    />,
  );
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('the bins are labelled in the zone the timeline was built in, not the current preference', () => {
  const saoPaulo = timelineWith({ volumes: [[100]], names: ['Budget'], timeZone: SAO_PAULO_TIME_ZONE });
  const props = {
    width: WIDTH,
    selectedIndex: 0,
    highlightedBandId: null,
    isLoadingVersion: false,
    onSelectIndex: vi.fn(),
    onClearSelection: vi.fn(),
  };
  render(<Streamgraph timeline={saoPaulo} {...props} />);
  const first = saoPaulo.bins[0]!;
  expect(screen.getByText(formatBinMoment({ time: first.start, binMs: saoPaulo.binMs, timeZone: SAO_PAULO_TIME_ZONE }))).toBeVisible();
});

const EDGE_BINS = 4;
const SILENT_BINS = 6;
const SILENCE_FIRST = EDGE_BINS;
const AFTER_SILENCE = EDGE_BINS + SILENT_BINS;
const LAST_BIN = 2 * EDGE_BINS + SILENT_BINS - 1;
const breakTimeline = timelineWith({
  volumes: [
    ...Array.from({ length: EDGE_BINS }, () => [100, 20]),
    ...Array.from({ length: SILENT_BINS }, () => [0, 0]),
    ...Array.from({ length: EDGE_BINS }, () => [100, 20]),
  ],
  names: ['Budget', 'Hiring'],
  agentActions: [
    {
      authorKey: FIXTURE_AGENT_AUTHOR_KEY,
      kind: AgentActionKind.DocumentExported,
      createdAt: timeline.bins[0]!.start + (SILENCE_FIRST + 2) * 60_000,
    },
  ],
});
const breakColumn = layoutStreamgraph({ timeline: breakTimeline, width: WIDTH }).breaks[0]!;

function renderBreakGraph({ selectedIndex = null }: { selectedIndex?: number | null } = {}) {
  const onSelectIndex = vi.fn();
  const view = render(
    <Streamgraph
      timeline={breakTimeline}
      width={WIDTH}
      selectedIndex={selectedIndex}
      highlightedBandId={null}
      onSelectIndex={onSelectIndex}
      isLoadingVersion={false}
      onClearSelection={vi.fn()}
    />,
  );
  const focusableBand = view.container.querySelector('path[tabindex="0"]')!;
  return { ...view, onSelectIndex, focusableBand };
}

test('a break is one dashed divider hidden from assistive technology', () => {
  const { container } = renderBreakGraph();
  const dividers = container.querySelectorAll('line[stroke-dasharray]');
  expect(dividers).toHaveLength(1);
  const [divider] = dividers;
  expect(divider).toHaveAttribute('aria-hidden', 'true');
  expect(divider!.getAttribute('class')).toContain('stroke-');
  expect(divider!.outerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
  expect(Number(divider!.getAttribute('x1'))).toBeCloseTo(breakColumn.centerX);
});

test('a chart without a break has no divider', () => {
  const { container } = renderGraph();
  expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(0);
});

test('the description says long stretches are shortened only when a break is drawn', () => {
  const withBreak = renderBreakGraph();
  expect(withBreak.container.querySelector('desc')!.textContent).toContain('Long stretches without edits are shortened.');
  withBreak.unmount();
  const withoutBreak = renderGraph();
  expect(withoutBreak.container.querySelector('desc')!.textContent).not.toContain('shortened');
});

test('hovering a break names how long there were no edits and shows no bin range', () => {
  const { container } = renderBreakGraph();
  fireEvent.pointerMove(container.querySelector('svg')!, { clientX: breakColumn.centerX, buttons: 0 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent('No edits for 6 minutes');
  expect(tooltip).not.toHaveTextContent('Budget');
  expect(tooltip).not.toHaveTextContent(
    asRendered(formatBinRange({ ...breakTimeline.bins[AFTER_SILENCE]!, binMs: breakTimeline.binMs, timeZone: UTC_TIME_ZONE })),
  );
});

test('hovering a bin beside the break still shows the range of the bin', () => {
  const { container } = renderBreakGraph();
  fireEvent.pointerMove(container.querySelector('svg')!, { clientX: 0, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    asRendered(formatBinRange({ ...breakTimeline.bins[0]!, binMs: breakTimeline.binMs, timeZone: UTC_TIME_ZONE })),
  );
});

test('pressing inside the break column selects the first bin after it', () => {
  const { container, onSelectIndex } = renderBreakGraph();
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: breakColumn.centerX, buttons: 1 });
  expect(onSelectIndex).toHaveBeenLastCalledWith(AFTER_SILENCE);
});

test.each([
  { key: 'ArrowRight', from: SILENCE_FIRST - 1, to: AFTER_SILENCE },
  { key: 'ArrowLeft', from: AFTER_SILENCE, to: SILENCE_FIRST - 1 },
  { key: 'ArrowLeft', from: SILENCE_FIRST + 2, to: SILENCE_FIRST - 1 },
  { key: 'ArrowRight', from: SILENCE_FIRST + 2, to: AFTER_SILENCE },
  { key: 'ArrowRight', from: 0, to: 1 },
  { key: 'ArrowLeft', from: AFTER_SILENCE + 1, to: AFTER_SILENCE },
  { key: 'Home', from: AFTER_SILENCE, to: 0 },
  { key: 'End', from: 0, to: LAST_BIN },
])('$key from bin $from selects bin $to across a break', ({ key, from, to }) => {
  const { focusableBand, onSelectIndex } = renderBreakGraph({ selectedIndex: from });
  fireEvent.keyDown(focusableBand, { key });
  expect(onSelectIndex).toHaveBeenLastCalledWith(to);
});

test('an agent action inside the break is drawn at the column centre', () => {
  renderBreakGraph();
  const mark = screen.getByRole('img', {
    name: agentActionLabel({ name: FIXTURE_AGENT_AUTHOR_NAME, kind: AgentActionKind.DocumentExported }),
  });
  expect(parseFloat(mark.style.left)).toBeCloseTo(breakColumn.centerX);
  fireEvent.pointerEnter(mark);
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    `${FIXTURE_AGENT_AUTHOR_NAME}'s AI ${AGENT_ACTION_LABELS[AgentActionKind.DocumentExported]}`,
  );
});
