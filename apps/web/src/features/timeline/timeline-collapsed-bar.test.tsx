import { documentPagePath, STREAMGRAPH_PULSE_MS, TimelineSearchParam } from '@superdoc-collab/types';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { REDUCED_MOTION_QUERY } from '@/lib/use-reduced-motion';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import type { TimelineChange } from './use-timeline-change';
import { TIMELINE_COLLAPSED_BAR_TEST_ID, TimelineCollapsedBar } from './timeline-collapsed-bar';
import { TIMELINE_HEADING } from './timeline-copy';

const ROUTE = documentPagePath(DOCUMENT_ID);
const timeline = timelineWith({ volumes: [[9, 7, 5, 3, 1]], names: ['Budget', 'Hiring', 'Legal', 'Office', 'Misc'] });
const [, hiring] = timeline.bands;

test('shows the three largest topic chips, and a click filters and opens the panel', async () => {
  const user = userEvent.setup();
  const onExpand = vi.fn();
  const { router } = renderWithProviders(<TimelineCollapsedBar timeline={timeline} change={null} onExpand={onExpand} />, { route: ROUTE });
  expect(screen.getByRole('heading', { name: TIMELINE_HEADING })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^(Budget|Hiring|Legal|Office|Misc)$/ }).map((chip) => chip.textContent)).toEqual([
    'Budget',
    'Hiring',
    'Legal',
  ]);
  await user.click(screen.getByRole('button', { name: 'Hiring' }));
  expect(router.state.location.search).toBe(`?${TimelineSearchParam.Topic}=${hiring!.id}`);
  expect(onExpand).toHaveBeenCalledTimes(1);
});

test('the expand button is named Edits panel and reports it is collapsed', async () => {
  const user = userEvent.setup();
  const onExpand = vi.fn();
  renderWithProviders(<TimelineCollapsedBar timeline={timeline} change={null} onExpand={onExpand} />, { route: ROUTE });
  const expand = screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  await user.click(expand);
  expect(onExpand).toHaveBeenCalledTimes(1);
});

test('before the timeline loads the bar shows only the heading and the expand button', () => {
  renderWithProviders(<TimelineCollapsedBar timeline={undefined} change={null} onExpand={vi.fn()} />, { route: ROUTE });
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('a topic that is already filtered stays filtered when its chip is clicked in the bar', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<TimelineCollapsedBar timeline={timeline} change={null} onExpand={vi.fn()} />, {
    route: `${ROUTE}?${TimelineSearchParam.Topic}=${hiring!.id}`,
  });
  await user.click(screen.getByRole('button', { name: 'Hiring' }));
  expect(router.state.location.search).toBe(`?${TimelineSearchParam.Topic}=${hiring!.id}`);
});

test('the bar carries the test id the end-to-end walk looks for', () => {
  renderWithProviders(<TimelineCollapsedBar timeline={timeline} change={null} onExpand={vi.fn()} />, { route: ROUTE });
  expect(screen.getByTestId(TIMELINE_COLLAPSED_BAR_TEST_ID)).toBe(screen.getByRole('heading', { name: TIMELINE_HEADING }).parentElement);
  expect(TIMELINE_COLLAPSED_BAR_TEST_ID).toBe('timeline-collapsed-bar');
});

test('a document without edits shows the heading and the expand button only', () => {
  renderWithProviders(<TimelineCollapsedBar timeline={timelineWith({ volumes: [], names: [] })} change={null} onExpand={vi.fn()} />, {
    route: ROUTE,
  });
  expect(screen.getByRole('heading', { name: TIMELINE_HEADING })).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

const GROW_LABEL = 'grow';
const PULSE_RING_SELECTOR = '.chip-pulse-ring';
const defaultMatchMedia = window.matchMedia;
const [budget, , , , misc] = timeline.bands;

afterEach(() => {
  vi.useRealTimers();
  vi.stubGlobal('matchMedia', defaultMatchMedia);
});

function BarWithChange({ bandId }: { bandId: string }) {
  const [change, setChange] = useState<TimelineChange | null>(null);
  return (
    <>
      <button type="button" onClick={() => setChange({ token: 1, binIndex: 0, bandId })}>
        {GROW_LABEL}
      </button>
      <TimelineCollapsedBar timeline={timeline} change={change} onExpand={vi.fn()} />
    </>
  );
}

function renderGrowing(bandId: string): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  renderWithProviders(<BarWithChange bandId={bandId} />, { route: ROUTE });
  fireEvent.click(screen.getByRole('button', { name: GROW_LABEL }));
}

test('a change on a shown band pulses its chip alone and settles', () => {
  renderGrowing(budget!.id);
  expect(screen.getByRole('button', { name: 'Budget' }).querySelector(PULSE_RING_SELECTOR)).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Hiring' }).querySelector(PULSE_RING_SELECTOR)).toBeNull();
  act(() => vi.advanceTimersByTime(STREAMGRAPH_PULSE_MS));
  expect(screen.getByRole('button', { name: 'Budget' }).querySelector(PULSE_RING_SELECTOR)).toBeNull();
});

test('a change on a band that has no chip pulses nothing', () => {
  renderGrowing(misc!.id);
  expect(document.querySelector(PULSE_RING_SELECTOR)).toBeNull();
});

test('under reduced motion a change pulses nothing', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === REDUCED_MOTION_QUERY,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  renderGrowing(budget!.id);
  expect(document.querySelector(PULSE_RING_SELECTOR)).toBeNull();
});

test('the expand button tooltip carries the Ctrl+Alt+E hint', async () => {
  renderWithProviders(<TimelineCollapsedBar timeline={timeline} change={null} onExpand={vi.fn()} />, { route: ROUTE });
  await userEvent.hover(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  const tooltip = await screen.findByRole('tooltip');
  expect([...tooltip.querySelectorAll('kbd')].map((pill) => pill.textContent)).toEqual(['Ctrl', 'Alt', 'E']);
});
