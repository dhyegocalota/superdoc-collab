import { TimelineBandKind, type TimelineBand } from '@superdoc-collab/types';
import type { CSSProperties } from 'react';

class MissingBandHueError extends Error {}

export function bandStyle(band: TimelineBand, saturation: number): CSSProperties | undefined {
  if (band.kind === TimelineBandKind.Other) return undefined;
  if (band.hue === null) throw new MissingBandHueError(band.id);
  return { '--topic-hue': String(band.hue), '--topic-saturation': `${saturation}%` } as CSSProperties;
}

export function bandFillClass(band: TimelineBand): string {
  return band.kind === TimelineBandKind.Other ? 'topic-band-other' : 'topic-band';
}
