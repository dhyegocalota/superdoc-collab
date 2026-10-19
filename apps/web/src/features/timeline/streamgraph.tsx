import type { DocumentTimeline } from '@superdoc-collab/types';
import { useId, useMemo } from 'react';
import { formatBinMoment, formatTimestamp } from '@/lib/format-date-time';
import { AgentActionMarks } from './agent-action-marks';
import { AgentLegend } from './agent-legend';
import { maxBandVolume } from './max-band-volume';
import { StreamgraphBands } from './streamgraph-bands';
import { CHART_HEIGHT, layoutStreamgraph } from './streamgraph-layout';
import { StreamgraphLegend } from './streamgraph-legend';
import { IdleBreakMarkers, SelectionMarker } from './streamgraph-markers';
import { StreamgraphTooltip } from './streamgraph-tooltip';
import { CHART_HINT, STREAMGRAPH_TITLE, streamgraphDescription } from './timeline-copy';
import { useStreamgraphInteraction } from './use-streamgraph-interaction';

type StreamgraphProps = {
  timeline: DocumentTimeline;
  width: number;
  selectedIndex: number | null;
  highlightedBandId: string | null;
  isLoadingVersion: boolean;
  onSelectIndex: (index: number) => void;
  onClearSelection: () => void;
};

export function Streamgraph({
  timeline,
  width,
  selectedIndex,
  highlightedBandId,
  isLoadingVersion,
  onSelectIndex,
  onClearSelection,
}: StreamgraphProps) {
  const { timeZone } = timeline;
  const titleId = useId();
  const descriptionId = useId();
  const tooltipId = useId();
  const layout = useMemo(() => layoutStreamgraph({ timeline, width }), [timeline, width]);
  const lastIndex = timeline.bins.length - 1;
  const { hasKeyboardFocus, tooltipAnchor, chartHandlers, bandHandlers } = useStreamgraphInteraction({
    layout,
    lastIndex,
    selectedIndex,
    isLoadingVersion,
    onSelectIndex,
    onClearSelection,
  });
  if (timeline.bins.length === 0) return null;
  const maxVolume = maxBandVolume(timeline);
  const hasAgentLayer = layout.shapes.some((shape) => shape.agentPath !== null);
  const hasUnlabelledBand = layout.shapes.some((shape) => shape.label === null);
  const firstMoment = timeline.bins[0]!.start;
  const lastMoment = timeline.bins[lastIndex]!.end;

  return (
    <div aria-busy={isLoadingVersion} className="relative flex flex-col gap-1">
      <svg width={width} height={CHART_HEIGHT} aria-labelledby={titleId} aria-describedby={descriptionId} {...chartHandlers}>
        <title id={titleId}>{STREAMGRAPH_TITLE}</title>
        <desc id={descriptionId}>
          {streamgraphDescription({
            bandCount: timeline.bands.length,
            from: formatTimestamp({ time: firstMoment, timeZone }),
            to: formatTimestamp({ time: lastMoment, timeZone }),
            hasIdleBreaks: layout.breaks.length > 0,
          })}
        </desc>
        <StreamgraphBands
          shapes={layout.shapes}
          highlightedBandId={highlightedBandId}
          describedById={hasKeyboardFocus && tooltipAnchor !== null ? tooltipId : undefined}
          bandHandlers={bandHandlers}
        />
        <IdleBreakMarkers breaks={layout.breaks} />
        {selectedIndex !== null && <SelectionMarker x={layout.binX(selectedIndex)} />}
      </svg>
      {timeline.agentActions.length > 0 && (
        <AgentActionMarks actions={timeline.agentActions} authors={timeline.authors} timeX={layout.timeX} chartWidth={width} />
      )}
      <div className="flex justify-between text-xs text-muted-foreground">
        <time dateTime={new Date(firstMoment).toISOString()}>
          {formatBinMoment({ time: firstMoment, binMs: timeline.binMs, timeZone })}
        </time>
        <time dateTime={new Date(lastMoment).toISOString()}>{formatBinMoment({ time: lastMoment, binMs: timeline.binMs, timeZone })}</time>
      </div>
      {hasUnlabelledBand && <StreamgraphLegend bands={layout.shapes.map((shape) => shape.band)} maxVolume={maxVolume} />}
      {hasAgentLayer && <AgentLegend />}
      <p className="text-xs text-muted-foreground">{CHART_HINT}</p>
      <StreamgraphTooltip id={tooltipId} anchor={tooltipAnchor} timeline={timeline} layout={layout} chartWidth={width} />
    </div>
  );
}
