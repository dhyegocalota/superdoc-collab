import type { DocumentTimeline } from '@superdoc-collab/types';

export type TimelineChange = { token: number; binIndex: number; bandId: string };

export function useTimelineChange(_params: { timeline: DocumentTimeline | undefined; scope: string }): TimelineChange | null {
  throw new Error('useTimelineChange is not implemented');
}
