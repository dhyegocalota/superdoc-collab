import { TimelineBandKind, type TimelineBand } from '@superdoc-collab/types';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { saturationOf } from './streamgraph-layout';

export function TopicSwatch({ band, maxVolume }: { band: TimelineBand; maxVolume: number }) {
  const isOther = band.kind === TimelineBandKind.Other;
  const swatchStyle = {
    '--topic-hue': String(band.hue),
    '--topic-saturation': `${saturationOf({ volume: band.volume, maxVolume })}%`,
  } as CSSProperties;
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full', isOther ? 'topic-swatch-other' : 'topic-swatch')}
      style={isOther ? undefined : swatchStyle}
    />
  );
}
