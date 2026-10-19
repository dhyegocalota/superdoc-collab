import { cellVolume } from '@superdoc-collab/history/timeline';
import type { DocumentTimeline, TimelineBin } from '@superdoc-collab/types';
import { useEffect, useRef, useState } from 'react';

export type TimelineChange = { token: number; binIndex: number; bandId: string };
type Baseline = { key: string; volumes: Map<string, number> };

function volumeKey({ bin, bandId }: { bin: TimelineBin; bandId: string }): string {
  return `${bin.start}|${bandId}`;
}

function volumesOf(timeline: DocumentTimeline): Map<string, number> {
  return new Map(
    timeline.bins.flatMap((bin) =>
      Object.entries(bin.byBand).map(([bandId, cell]): [string, number] => [volumeKey({ bin, bandId }), cellVolume(cell)]),
    ),
  );
}

function growthOf({ bin, previous }: { bin: TimelineBin; previous: Map<string, number> }): { bandId: string; growth: number } | null {
  const [largest] = Object.entries(bin.byBand)
    .map(([bandId, cell]) => {
      const before = previous.get(volumeKey({ bin, bandId }));
      return { bandId, growth: cellVolume(cell) - (before === undefined ? 0 : before) };
    })
    .sort((left, right) => right.growth - left.growth);
  if (!largest || largest.growth <= 0) return null;
  return largest;
}

function newestGrowth({ timeline, previous }: { timeline: DocumentTimeline; previous: Map<string, number> }) {
  return timeline.bins
    .flatMap((bin, binIndex) => {
      const growth = growthOf({ bin, previous });
      if (!growth) return [];
      return [{ binIndex, bandId: growth.bandId }];
    })
    .at(-1);
}

export function useTimelineChange({ timeline, scope }: { timeline: DocumentTimeline | undefined; scope: string }): TimelineChange | null {
  const [change, setChange] = useState<TimelineChange | null>(null);
  const baseline = useRef<Baseline | null>(null);
  const tokens = useRef(0);

  useEffect(() => {
    if (!timeline) return;
    const previous = baseline.current;
    const key = `${scope}|${timeline.binMs}|${timeline.timeZone}`;
    baseline.current = { key, volumes: volumesOf(timeline) };
    if (!previous || previous.key !== key) return;
    const newest = newestGrowth({ timeline, previous: previous.volumes });
    if (!newest) return;
    tokens.current += 1;
    setChange({ token: tokens.current, ...newest });
  }, [timeline, scope]);

  return change;
}
