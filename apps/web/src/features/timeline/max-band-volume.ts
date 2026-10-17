import type { DocumentTimeline } from '@superdoc-history/types';

export function maxBandVolume(timeline: DocumentTimeline): number {
  return Math.max(0, ...timeline.bands.map((band) => band.volume));
}
