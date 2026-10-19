import type { TimelineChange } from './use-timeline-change';

export function useChangePulse(_params: { change: TimelineChange | null; isSuppressed: boolean }): TimelineChange | null {
  throw new Error('useChangePulse is not implemented');
}
