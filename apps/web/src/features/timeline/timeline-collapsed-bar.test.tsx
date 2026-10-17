import { documentPagePath, TimelineSearchParam } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { TimelineCollapsedBar } from './timeline-collapsed-bar';
import { TIMELINE_HEADING } from './timeline-copy';

const ROUTE = documentPagePath(DOCUMENT_ID);
const timeline = timelineWith({ volumes: [[9, 7, 5, 3, 1]], names: ['Budget', 'Hiring', 'Legal', 'Office', 'Misc'] });
const [, hiring] = timeline.bands;

test('shows the three largest topic chips, and a click filters and opens the panel', async () => {
  const user = userEvent.setup();
  const onExpand = vi.fn();
  const { router } = renderWithProviders(<TimelineCollapsedBar timeline={timeline} onExpand={onExpand} />, { route: ROUTE });
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
  renderWithProviders(<TimelineCollapsedBar timeline={timeline} onExpand={onExpand} />, { route: ROUTE });
  const expand = screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  await user.click(expand);
  expect(onExpand).toHaveBeenCalledTimes(1);
});

test('before the timeline loads the bar shows only the heading and the expand button', () => {
  renderWithProviders(<TimelineCollapsedBar timeline={undefined} onExpand={vi.fn()} />, { route: ROUTE });
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('a topic that is already filtered stays filtered when its chip is clicked in the bar', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<TimelineCollapsedBar timeline={timeline} onExpand={vi.fn()} />, {
    route: `${ROUTE}?${TimelineSearchParam.Topic}=${hiring!.id}`,
  });
  await user.click(screen.getByRole('button', { name: 'Hiring' }));
  expect(router.state.location.search).toBe(`?${TimelineSearchParam.Topic}=${hiring!.id}`);
});
