import { SelectionSummaryState, type EditSelection, type SelectionSummaryView } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { timelineWith } from '@/test/timeline-fixtures';
import { errorForSelection, selectionVolume, summarizeDisabledReason } from './selection-summary';
import { NO_EDITS_TO_SUMMARIZE_MESSAGE, SUMMARIES_UNAVAILABLE_MESSAGE, SUMMARIZING_EDITS_MESSAGE, SUMMARY_UP_TO_DATE_MESSAGE } from './timeline-copy';

const timeline = timelineWith({ volumes: [[10, 0], [0, 5]], names: ['Budget', 'Hiring'] });
const NO_SELECTION: EditSelection = { term: null, author: null, topic: null, at: null };
const READY: SelectionSummaryView = { state: SelectionSummaryState.Ready, summary: { key: 'k', sentence: 'Ana raised the budget.', authors: ['Ana'], computedAtSequence: 3, isStale: false }, failure: null, isModelAvailable: true };

test('the volume of a selection follows its topic and period', () => {
  expect(selectionVolume({ timeline, selection: NO_SELECTION })).toBe(15);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, topic: 'band-1' } })).toBe(5);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, at: timeline.bins[0]!.start } })).toBe(10);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, at: timeline.bins[0]!.start, topic: 'band-1' } })).toBe(0);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, at: 1 } })).toBe(0);
});

test('Summarize explains why it is disabled, the empty selection first', () => {
  expect(summarizeDisabledReason({ volume: 0, view: READY, isPending: true })).toBe(NO_EDITS_TO_SUMMARIZE_MESSAGE);
  expect(summarizeDisabledReason({ volume: 5, view: READY, isPending: true })).toBe(SUMMARIZING_EDITS_MESSAGE);
  expect(summarizeDisabledReason({ volume: 5, view: { ...READY, state: SelectionSummaryState.Running }, isPending: false })).toBe(SUMMARIZING_EDITS_MESSAGE);
  expect(summarizeDisabledReason({ volume: 5, view: { ...READY, state: SelectionSummaryState.Failed, isModelAvailable: false }, isPending: false })).toBe(SUMMARIES_UNAVAILABLE_MESSAGE);
  expect(summarizeDisabledReason({ volume: 5, view: READY, isPending: false })).toBe(SUMMARY_UP_TO_DATE_MESSAGE);
  expect(summarizeDisabledReason({ volume: 5, view: { ...READY, summary: { ...READY.summary!, isStale: true } }, isPending: false })).toBeNull();
  expect(summarizeDisabledReason({ volume: 5, view: undefined, isPending: false })).toBeNull();
});

test('an error belongs only to the selection that caused it', () => {
  const error = new Error('too soon');
  expect(errorForSelection({ error, variables: NO_SELECTION, selection: NO_SELECTION })).toBe(error);
  expect(errorForSelection({ error, variables: NO_SELECTION, selection: { ...NO_SELECTION, author: 'bruno' } })).toBeNull();
  expect(errorForSelection({ error: null, variables: NO_SELECTION, selection: NO_SELECTION })).toBeNull();
});
