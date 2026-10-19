import {
  HISTORY_CATCHING_UP_MESSAGE,
  SECOND_MS,
  TOPICS_UNAVAILABLE_MESSAGE,
  TopicState,
  type DocumentTimeline,
} from '@superdoc-collab/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { lagBehindLabel, NO_EDITS_YET_MESSAGE, RETRY_TOPICS_LABEL } from './timeline-copy';
import { PROJECTION_LAG_NOTICE_MS, TimelineNotices } from './timeline-notices';

const FAILURE_TEXT = 'The model refused';
const failedTimeline: DocumentTimeline = {
  ...timelineWith({ volumes: [[10]], names: ['Budget'] }),
  topics: { state: TopicState.Failed, failure: FAILURE_TEXT, computedAtSequence: null },
};

test('Retry runs the callback it is given, once per click', async () => {
  const onRetry = vi.fn();
  render(<TimelineNotices timeline={failedTimeline} hasFilter={false} isLogAhead={false} canRefresh onRetry={onRetry} />);
  expect(screen.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(FAILURE_TEXT)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: RETRY_TOPICS_LABEL }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('a reader gets no Retry', () => {
  render(<TimelineNotices timeline={failedTimeline} hasFilter={false} isLogAhead={false} canRefresh={false} onRetry={vi.fn()} />);
  expect(screen.queryByRole('button', { name: RETRY_TOPICS_LABEL })).not.toBeInTheDocument();
});

const emptyTimeline: DocumentTimeline = { ...timelineWith({ volumes: [], names: [] }), bins: [] };

test('the empty copy shows when there are no bins and the projection caught up', () => {
  render(<TimelineNotices timeline={emptyTimeline} hasFilter={false} isLogAhead={false} canRefresh onRetry={vi.fn()} />);
  expect(screen.getByText(NO_EDITS_YET_MESSAGE)).toBeInTheDocument();
});

test('the empty copy stays hidden while the projection is behind the log', () => {
  const behindTimeline: DocumentTimeline = {
    ...emptyTimeline,
    projection: { ...emptyTimeline.projection, isBehind: true, lagMs: 200 },
  };
  render(<TimelineNotices timeline={behindTimeline} hasFilter={false} isLogAhead={false} canRefresh onRetry={vi.fn()} />);
  expect(screen.queryByText(NO_EDITS_YET_MESSAGE)).not.toBeInTheDocument();
});

test('the empty copy stays hidden while the log is ahead of the last timeline answer', () => {
  render(<TimelineNotices timeline={emptyTimeline} hasFilter={false} isLogAhead canRefresh onRetry={vi.fn()} />);
  expect(screen.queryByText(NO_EDITS_YET_MESSAGE)).not.toBeInTheDocument();
});

const ROUNDING_LAG_MS = 14_600;
const ROUNDED_LAG_SECONDS = 15;

function behindFor(lagMs: number | null): DocumentTimeline {
  const timeline = timelineWith({ volumes: [[10]], names: ['Budget'] });
  return { ...timeline, projection: { ...timeline.projection, isBehind: true, lagMs } };
}

test('a projection behind by the threshold says it is catching up with the rounded seconds', () => {
  render(<TimelineNotices timeline={behindFor(ROUNDING_LAG_MS)} hasFilter={false} isLogAhead={false} canRefresh onRetry={vi.fn()} />);
  expect(screen.getByText(HISTORY_CATCHING_UP_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(lagBehindLabel(ROUNDED_LAG_SECONDS))).toBeInTheDocument();
});

test('a projection behind by less than the threshold or by an unknown lag says nothing', () => {
  const { rerender } = render(
    <TimelineNotices
      timeline={behindFor(PROJECTION_LAG_NOTICE_MS - 1)}
      hasFilter={false}
      isLogAhead={false}
      canRefresh
      onRetry={vi.fn()}
    />,
  );
  expect(screen.queryByText(HISTORY_CATCHING_UP_MESSAGE)).not.toBeInTheDocument();
  rerender(<TimelineNotices timeline={behindFor(null)} hasFilter={false} isLogAhead={false} canRefresh onRetry={vi.fn()} />);
  expect(screen.queryByText(HISTORY_CATCHING_UP_MESSAGE)).not.toBeInTheDocument();
});
