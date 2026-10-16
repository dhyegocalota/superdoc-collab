import { TimelineBandKind, TimelineSearchParam, type TimelineBand } from '@superdoc-history/types';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { saturationOf } from './streamgraph-layout';
import { useTimelineSearch } from './use-timeline-search';

export function TopicChip({ band, maxVolume }: { band: TimelineBand; maxVolume: number }) {
  const { search, update } = useTimelineSearch();
  const isOther = band.kind === TimelineBandKind.Other;
  const isActive = search.topic === band.id;
  const swatchStyle = { '--topic-hue': String(band.hue), '--topic-saturation': `${saturationOf({ volume: band.volume, maxVolume })}%` } as CSSProperties;

  function toggle(): void {
    update({ changes: { [TimelineSearchParam.Topic]: isActive ? null : band.id }, replace: true });
  }

  return (
    <button type="button" aria-pressed={isActive} onClick={toggle} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium', isActive && 'bg-accent')}>
      <span className={cn('size-2.5 rounded-full', isOther ? 'topic-swatch-other' : 'topic-swatch')} style={isOther ? undefined : swatchStyle} />
      {band.name}
    </button>
  );
}
