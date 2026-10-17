import type { DocumentTimeline } from '@superdoc-collab/types';

export function timelineStamp(timeline: DocumentTimeline): string {
  return `${timeline.projection.cursor}:${timeline.topics.state}:${timeline.topics.computedAtSequence}`;
}
