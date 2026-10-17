import { cellVolume } from '@superdoc-collab/history/timeline';
import type { DocumentTimeline, EditSelection } from '@superdoc-collab/types';

export function selectionVolume({ timeline, selection }: { timeline: DocumentTimeline; selection: EditSelection }): number {
  return timeline.bins
    .filter((bin) => selection.at === null || bin.start === selection.at)
    .flatMap((bin) => Object.entries(bin.byBand))
    .filter(([bandId]) => selection.topic === null || bandId === selection.topic)
    .reduce((total, [, cell]) => total + cellVolume(cell), 0);
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
