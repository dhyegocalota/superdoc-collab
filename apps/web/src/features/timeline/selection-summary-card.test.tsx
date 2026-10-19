import {
  authorColorKeyOf,
  authorColorSlot,
  ClientActor,
  SECOND_MS,
  SelectionSummaryState,
  SummarizeOutcome,
  SummarizeStep,
  type EventAuthor,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FIXTURE_AUTHOR_NAME, FIXTURE_SUMMARY_AUTHOR } from '@/testing/timeline-fixtures';
import { SelectionSummaryCard } from './selection-summary-card';
import {
  agentMarkLabel,
  importedAuthorLabel,
  EARLIER_STATE_LABEL,
  GROUPING_TOPICS_MESSAGE,
  NO_EDITS_TO_SUMMARIZE_MESSAGE,
  NEXT_SUMMARIZING_LABEL,
  RETRY_SUMMARY_LABEL,
  retryInLabel,
  SELECTION_SUMMARY_HEADING,
  SUMMARIZING_EDITS_MESSAGE,
  SUMMARY_UP_TO_DATE_MESSAGE,
  TOPICS_GROUPED_LABEL,
} from './timeline-copy';
import type { SummarizeControl } from './use-summarize';

vi.mock('./use-author-color-slots', () => ({
  useAuthorColorSlots: () => (author: Pick<EventAuthor, 'id' | 'name'>) => authorColorSlot(authorColorKeyOf(author)),
}));

const AUTHORS: Record<string, EventAuthor> = {
  ana: { id: 'user-1', name: FIXTURE_AUTHOR_NAME, actor: ClientActor.Human },
  'ana#agent': { id: 'user-1#agent', name: FIXTURE_AUTHOR_NAME, actor: ClientActor.Agent },
  bob: { id: 'user-2', name: 'Bob · AI', actor: ClientActor.Human },
};
const NONE_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.None,
  summary: null,
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
  partial: null,
};
const RUNNING_VIEW: SelectionSummaryView = { ...NONE_VIEW, state: SelectionSummaryState.Running };
const FIRST_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.Ready,
  summary: { key: 'first', sentence: 'Ana raised the budget.', authors: [FIXTURE_SUMMARY_AUTHOR], computedAtSequence: 3, isStale: false },
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
  partial: null,
};
const SECOND_VIEW: SelectionSummaryView = { ...FIRST_VIEW, summary: { ...FIRST_VIEW.summary!, key: 'second', sentence: 'Ana hired.' } };
const FAILED_VIEW: SelectionSummaryView = {
  ...NONE_VIEW,
  state: SelectionSummaryState.Failed,
  failure: 'The edits could not be summarized. Try again.',
};
const scrollIntoView = vi.fn();

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
});

function idleSummarize(overrides: Partial<SummarizeControl> = {}): SummarizeControl {
  return {
    summarize: vi.fn(),
    isRunning: false,
    outcome: null,
    error: null,
    retryAfterSeconds: null,
    showSelection: vi.fn(),
    ...overrides,
  };
}

function card({
  view,
  summarize = idleSummarize(),
  canRequest = true,
}: {
  view: SelectionSummaryView;
  summarize?: SummarizeControl;
  canRequest?: boolean;
}) {
  return <SelectionSummaryCard view={view} summarize={summarize} canRequest={canRequest} authors={AUTHORS} />;
}

test('a run reveals the card when it starts and once more when its result lands', () => {
  const { rerender } = render(card({ view: FIRST_VIEW }));
  rerender(card({ view: RUNNING_VIEW }));
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  rerender(card({ view: SECOND_VIEW }));
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('moving between cached summaries never scrolls', () => {
  const { rerender } = render(card({ view: FIRST_VIEW }));
  rerender(card({ view: SECOND_VIEW }));
  rerender(card({ view: FIRST_VIEW }));
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
  render(card({ view }));
  expect(screen.getAllByRole('img', { name: agentMarkLabel(FIXTURE_AUTHOR_NAME) })).toHaveLength(1);
  expect(screen.getByTitle('Bob · AI')).not.toContainElement(screen.getByRole('img'));
});

test('the summary avatars use the colour of the person found by name in the timeline authors', () => {
  render(card({ view: FIRST_VIEW }));
  const avatar = screen.getByTitle(FIXTURE_AUTHOR_NAME).firstElementChild;
  expect(avatar).toHaveClass(`bg-author-${authorColorSlot(authorColorKeyOf(AUTHORS.ana!))}`);
});

test('a summary author missing from the timeline is coloured as an imported author, never a throw', () => {
  const view: SelectionSummaryView = {
    ...FIRST_VIEW,
    summary: { ...FIRST_VIEW.summary!, authors: [{ name: 'Chris Crawford', actor: ClientActor.Human }] },
  };
  render(card({ view }));
  const avatar = screen.getByTitle(importedAuthorLabel('Chris Crawford')).firstElementChild;
  expect(avatar).toHaveClass(`bg-author-${authorColorSlot(authorColorKeyOf({ id: null, name: 'Chris Crawford' }))}`);
});

test('step grouping shows the grouping message, and step summarizing shows Topics grouped with a check', () => {
  const { rerender } = render(card({ view: { ...RUNNING_VIEW, step: SummarizeStep.Grouping } }));
  const section = screen.getByRole('region', { name: SELECTION_SUMMARY_HEADING });
  expect(within(section).getByText(GROUPING_TOPICS_MESSAGE)).toBeInTheDocument();
  expect(within(section).getByText(NEXT_SUMMARIZING_LABEL)).toBeInTheDocument();
  expect(within(section).queryByText(TOPICS_GROUPED_LABEL)).not.toBeInTheDocument();
  rerender(card({ view: { ...RUNNING_VIEW, step: SummarizeStep.Summarizing } }));
  expect(within(section).getByText(TOPICS_GROUPED_LABEL)).toBeInTheDocument();
  expect(within(section).getByText(TOPICS_GROUPED_LABEL).querySelector('svg')).not.toBeNull();
  expect(within(section).getByText(SUMMARIZING_EDITS_MESSAGE)).toBeInTheDocument();
  expect(within(section).queryByText(GROUPING_TOPICS_MESSAGE)).not.toBeInTheDocument();
});

test('a request in flight before the server reports a step shows the summarizing message', () => {
  render(card({ view: NONE_VIEW, summarize: idleSummarize({ isRunning: true }) }));
  expect(screen.getByText(SUMMARIZING_EDITS_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(GROUPING_TOPICS_MESSAGE)).not.toBeInTheDocument();
});

test('an up-to-date outcome keeps the sentence and says the summary is up to date', () => {
  render(card({ view: FIRST_VIEW, summarize: idleSummarize({ outcome: SummarizeOutcome.UpToDate }) }));
  expect(screen.getByText(FIRST_VIEW.summary!.sentence)).toBeInTheDocument();
  expect(screen.getByText(SUMMARY_UP_TO_DATE_MESSAGE)).toBeInTheDocument();
});

test('an empty selection answered up to date shows the empty message, not the up-to-date line', () => {
  render(card({ view: NONE_VIEW, summarize: idleSummarize({ outcome: SummarizeOutcome.UpToDate }) }));
  expect(screen.getByText(NO_EDITS_TO_SUMMARIZE_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(SUMMARY_UP_TO_DATE_MESSAGE)).not.toBeInTheDocument();
});

test('an up-to-date outcome followed by a stale view shows the badge without the up-to-date line', () => {
  const stale: SelectionSummaryView = { ...FIRST_VIEW, summary: { ...FIRST_VIEW.summary!, isStale: true } };
  render(card({ view: stale, summarize: idleSummarize({ outcome: SummarizeOutcome.UpToDate }) }));
  expect(screen.getByText(EARLIER_STATE_LABEL)).toBeInTheDocument();
  expect(screen.queryByText(SUMMARY_UP_TO_DATE_MESSAGE)).not.toBeInTheDocument();
});

test('a started outcome does not say the summary is up to date', () => {
  render(card({ view: FIRST_VIEW, summarize: idleSummarize({ outcome: SummarizeOutcome.Started }) }));
  expect(screen.queryByText(SUMMARY_UP_TO_DATE_MESSAGE)).not.toBeInTheDocument();
});

test('a stale summary shows the earlier-state badge', () => {
  render(card({ view: { ...FIRST_VIEW, summary: { ...FIRST_VIEW.summary!, isStale: true } } }));
  expect(screen.getByText(EARLIER_STATE_LABEL)).toBeInTheDocument();
});

test('an error shows its message and Retry summary runs the job again', async () => {
  const summarize = idleSummarize({ error: new Error('The edits could not be grouped into topics. Try again.') });
  render(card({ view: NONE_VIEW, summarize }));
  expect(screen.getByRole('alert')).toHaveTextContent('The edits could not be grouped into topics. Try again.');
  await userEvent.click(screen.getByRole('button', { name: RETRY_SUMMARY_LABEL }));
  expect(summarize.summarize).toHaveBeenCalledTimes(1);
});

test('a cooldown shows the seconds to wait and offers no retry yet', () => {
  render(card({ view: NONE_VIEW, summarize: idleSummarize({ error: new Error('Summarizing is busy.'), retryAfterSeconds: 24 }) }));
  expect(screen.getByRole('alert')).toHaveTextContent(`Summarizing is busy. ${retryInLabel(24)}`);
  expect(screen.queryByRole('button', { name: RETRY_SUMMARY_LABEL })).not.toBeInTheDocument();
});

test('the cooldown ticks down each second', () => {
  vi.useFakeTimers();
  render(card({ view: NONE_VIEW, summarize: idleSummarize({ error: new Error('Summarizing is busy.'), retryAfterSeconds: 5 }) }));
  expect(screen.getByRole('alert')).toHaveTextContent(retryInLabel(5));
  act(() => vi.advanceTimersByTime(2 * SECOND_MS));
  expect(screen.getByRole('alert')).toHaveTextContent(retryInLabel(3));
});

test('a failed summary offers a retry to editors only', async () => {
  const summarize = idleSummarize();
  const { rerender } = render(card({ view: FAILED_VIEW, summarize }));
  expect(screen.getByText(FAILED_VIEW.failure!)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: RETRY_SUMMARY_LABEL }));
  expect(summarize.summarize).toHaveBeenCalledTimes(1);
  rerender(card({ view: FAILED_VIEW, summarize, canRequest: false }));
  expect(screen.queryByRole('button', { name: RETRY_SUMMARY_LABEL })).not.toBeInTheDocument();
});

test('Retry summary is disabled while the job runs', () => {
  render(card({ view: FAILED_VIEW, summarize: idleSummarize({ isRunning: true }) }));
  expect(screen.getByRole('button', { name: RETRY_SUMMARY_LABEL })).toBeDisabled();
});

test('without a language model the card has no content', () => {
  render(card({ view: { ...FAILED_VIEW, isModelAvailable: false } }));
  expect(screen.queryByRole('region', { name: SELECTION_SUMMARY_HEADING })).not.toBeInTheDocument();
});

test('the card sits in a polite live region that exists before it has content', () => {
  const { container } = render(<SelectionSummaryCard view={undefined} summarize={idleSummarize()} canRequest authors={AUTHORS} />);
  expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
});
