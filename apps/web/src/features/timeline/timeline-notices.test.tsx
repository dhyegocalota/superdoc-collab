import { TOPICS_UNAVAILABLE_MESSAGE, TopicState, type DocumentTimeline } from '@superdoc-collab/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { RETRY_TOPICS_LABEL } from './timeline-copy';
import { TimelineNotices } from './timeline-notices';

const FAILURE_TEXT = 'The model refused';
const failedTimeline: DocumentTimeline = {
  ...timelineWith({ volumes: [[10]], names: ['Budget'] }),
  topics: { state: TopicState.Failed, failure: FAILURE_TEXT, computedAtSequence: null },
};

test('Retry runs the callback it is given, once per click', async () => {
  const onRetry = vi.fn();
  render(<TimelineNotices timeline={failedTimeline} hasFilter={false} canRefresh onRetry={onRetry} />);
  expect(screen.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(FAILURE_TEXT)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: RETRY_TOPICS_LABEL }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('a reader gets no Retry', () => {
  render(<TimelineNotices timeline={failedTimeline} hasFilter={false} canRefresh={false} onRetry={vi.fn()} />);
  expect(screen.queryByRole('button', { name: RETRY_TOPICS_LABEL })).not.toBeInTheDocument();
});
