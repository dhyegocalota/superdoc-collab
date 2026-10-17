import { cellVolume } from '@superdoc-collab/history/timeline';
import { SelectionSummaryState, type DocumentTimeline, type EditSelection, type SelectionSummaryView } from '@superdoc-collab/types';
import {
  NO_EDITS_TO_SUMMARIZE_MESSAGE,
  SUMMARIES_UNAVAILABLE_MESSAGE,
  SUMMARIZING_EDITS_MESSAGE,
  SUMMARY_UP_TO_DATE_MESSAGE,
} from './timeline-copy';

export function selectionVolume({ timeline, selection }: { timeline: DocumentTimeline; selection: EditSelection }): number {
  return timeline.bins
    .filter((bin) => selection.at === null || bin.start === selection.at)
    .flatMap((bin) => Object.entries(bin.byBand))
    .filter(([bandId]) => selection.topic === null || bandId === selection.topic)
    .reduce((total, [, cell]) => total + cellVolume(cell), 0);
}

export function summarizeDisabledReason({
  volume,
  view,
  isPending,
}: {
  volume: number;
  view: SelectionSummaryView | undefined;
  isPending: boolean;
}): string | null {
  if (volume === 0) return NO_EDITS_TO_SUMMARIZE_MESSAGE;
  if (isPending) return SUMMARIZING_EDITS_MESSAGE;
  if (view === undefined) return null;
  if (view.state === SelectionSummaryState.Running) return SUMMARIZING_EDITS_MESSAGE;
  if (!view.isModelAvailable) return SUMMARIES_UNAVAILABLE_MESSAGE;
  const isUpToDate = view.state === SelectionSummaryState.Ready && view.summary !== null && !view.summary.isStale;
  if (isUpToDate) return SUMMARY_UP_TO_DATE_MESSAGE;
  return null;
}

export function isSameSelection({ left, right }: { left: EditSelection; right: EditSelection }): boolean {
  return left.term === right.term && left.author === right.author && left.topic === right.topic && left.at === right.at;
}

export function errorForSelection({
  error,
  variables,
  selection,
}: {
  error: Error | null;
  variables: EditSelection | undefined;
  selection: EditSelection;
}): Error | null {
  if (error === null || variables === undefined) return null;
  if (!isSameSelection({ left: variables, right: selection })) return null;
  return error;
}

export function timelineStamp(timeline: DocumentTimeline): string {
  return `${timeline.projection.cursor}:${timeline.topics.state}:${timeline.topics.computedAtSequence}`;
}
