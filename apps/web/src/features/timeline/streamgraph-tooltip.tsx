import type { DocumentTimeline } from '@superdoc-collab/types';
import type { StreamgraphLayout } from './streamgraph-layout';
import { IdleBreakTooltip, TimelineTooltip } from './timeline-tooltip';
import type { TooltipAnchor } from './use-streamgraph-interaction';

export function StreamgraphTooltip({
  id,
  anchor,
  timeline,
  layout,
  chartWidth,
}: {
  id: string;
  anchor: TooltipAnchor | null;
  timeline: DocumentTimeline;
  layout: StreamgraphLayout;
  chartWidth: number;
}) {
  if (anchor === null) return null;
  if (anchor.idleBreak !== null) {
    return (
      <IdleBreakTooltip
        id={id}
        durationMs={anchor.idleBreak.durationMs}
        left={anchor.idleBreak.centerX}
        top={anchor.top}
        chartWidth={chartWidth}
      />
    );
  }
  return (
    <TimelineTooltip
      id={id}
      timeline={timeline}
      index={anchor.index}
      left={layout.binX(anchor.index)}
      top={anchor.top}
      chartWidth={chartWidth}
    />
  );
}
