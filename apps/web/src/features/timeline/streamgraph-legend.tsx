import type { TimelineBand } from '@superdoc-collab/types';
import { LEGEND_LABEL } from './timeline-copy';
import { TopicSwatch } from './topic-swatch';

export function StreamgraphLegend({ bands, maxVolume }: { bands: TimelineBand[]; maxVolume: number }) {
  return (
    <ul aria-label={LEGEND_LABEL} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {bands.map((band) => (
        <li key={band.id} className="flex items-center gap-1.5">
          <TopicSwatch band={band} maxVolume={maxVolume} />
          {band.name}
        </li>
      ))}
    </ul>
  );
}
