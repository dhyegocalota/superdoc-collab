import type { DocumentTimeline } from '@superdoc-collab/types';

export type IdleBreak = { firstIndex: number; lastIndex: number; durationMs: number };

export function idleBreaksOf(_: { timeline: DocumentTimeline; thresholdMs: number }): IdleBreak[] {
  throw new Error('idleBreaksOf is not implemented');
}
