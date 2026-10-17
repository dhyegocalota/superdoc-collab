import { ClientActor, SelectionSummaryState, SummarizeStep, type SelectionSummaryView } from '@superdoc-collab/types';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FIXTURE_AUTHOR_NAME, FIXTURE_SUMMARY_AUTHOR } from '@/testing/timeline-fixtures';
import { SelectionSummaryCard } from './selection-summary-card';
import { agentMarkLabel } from './timeline-copy';

const RUNNING_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.Running,
  summary: null,
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
};
const FIRST_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.Ready,
  summary: { key: 'first', sentence: 'Ana raised the budget.', authors: [FIXTURE_SUMMARY_AUTHOR], computedAtSequence: 3, isStale: false },
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
};
const SECOND_VIEW: SelectionSummaryView = { ...FIRST_VIEW, summary: { ...FIRST_VIEW.summary!, key: 'second', sentence: 'Ana hired.' } };
const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
});

function card(view: SelectionSummaryView) {
  return <SelectionSummaryCard view={view} error={null} canRequest isPending={false} onRetry={vi.fn()} />;
}

test('a run reveals the card when it starts and once more when its result lands', () => {
  const { rerender } = render(card(FIRST_VIEW));
  rerender(card(RUNNING_VIEW));
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  rerender(card(SECOND_VIEW));
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('moving between cached summaries never scrolls', () => {
  const { rerender } = render(card(FIRST_VIEW));
  rerender(card(SECOND_VIEW));
  rerender(card(FIRST_VIEW));
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('an agent author is marked from the actor, a human named like one is not', () => {
  const view: SelectionSummaryView = {
    ...FIRST_VIEW,
    summary: {
      ...FIRST_VIEW.summary!,
      authors: [
        { name: FIXTURE_AUTHOR_NAME, actor: ClientActor.Agent },
        { name: 'Bob · AI', actor: ClientActor.Human },
      ],
    },
  };
  render(card(view));
  expect(screen.getAllByRole('img', { name: agentMarkLabel(FIXTURE_AUTHOR_NAME) })).toHaveLength(1);
  expect(screen.getByTitle('Bob · AI')).not.toContainElement(screen.getByRole('img'));
});
