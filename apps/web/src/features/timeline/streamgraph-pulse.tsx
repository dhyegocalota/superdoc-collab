import { STREAMGRAPH_PULSE_MS } from '@superdoc-collab/types';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { bandFillClass, bandStyle } from './band-style';
import type { BandShape } from './streamgraph-layout';

const GLOW_RADIUS_PX = 28;

export const PULSE_STYLE: CSSProperties = { animationDuration: `${STREAMGRAPH_PULSE_MS}ms` };

export function PulseGlow({ shape, x, y }: { shape: BandShape; x: number; y: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={GLOW_RADIUS_PX}
      aria-hidden
      className={cn('pointer-events-none streamgraph-pulse', bandFillClass(shape.band))}
      style={{ ...bandStyle(shape.band, shape.saturation), ...PULSE_STYLE }}
    />
  );
}
