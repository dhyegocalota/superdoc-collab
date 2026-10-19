import type { DocumentTimeline } from '@superdoc-collab/types';
import type { BreakColumn, StreamgraphLayout } from './streamgraph-layout';
import { IdleBreakTooltip, TimelineTooltip, TOOLTIP_POINTER_OFFSET } from './timeline-tooltip';

export type Hovered = { index: number; y: number; idleBreak: BreakColumn | null };
export type TooltipAnchor = { index: number; top: number; idleBreak: BreakColumn | null };

export function tooltipAnchorOf({
  hovered,
  selectedIndex,
  hasFocus,
}: {
  hovered: Hovered | null;
  selectedIndex: number | null;
  hasFocus: boolean;
}): TooltipAnchor | null {
  if (hovered !== null) return { index: hovered.index, top: hovered.y + TOOLTIP_POINTER_OFFSET, idleBreak: hovered.idleBreak };
  if (!hasFocus || selectedIndex === null) return null;
  return { index: selectedIndex, top: TOOLTIP_POINTER_OFFSET, idleBreak: null };
}

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
