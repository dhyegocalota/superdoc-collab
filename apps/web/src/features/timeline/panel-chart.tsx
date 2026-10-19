import type { DocumentTimeline } from '@superdoc-collab/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Streamgraph } from './streamgraph';
import { CHART_HEIGHT } from './streamgraph-layout';
import { LOADING_TIMELINE_LABEL } from './timeline-copy';

type PanelChartProps = {
  chartRef: (element: HTMLElement | null) => void;
  chartWidth: number;
  timeline: DocumentTimeline | undefined;
  isTimelinePending: boolean;
  selectedIndex: number | null;
  highlightedBandId: string | null;
  isLoadingVersion: boolean;
  onSelectIndex: (index: number) => void;
  onClearSelection: () => void;
};

export function PanelChart({
  chartRef,
  chartWidth,
  timeline,
  isTimelinePending,
  selectedIndex,
  highlightedBandId,
  isLoadingVersion,
  onSelectIndex,
  onClearSelection,
}: PanelChartProps) {
  return (
    <div ref={chartRef} className="shrink-0 overflow-visible">
      {isTimelinePending && (
        <Skeleton role="status" aria-label={LOADING_TIMELINE_LABEL} className="w-full" style={{ height: CHART_HEIGHT }} />
      )}
      {timeline && chartWidth > 0 && (
        <Streamgraph
          timeline={timeline}
          width={chartWidth}
          selectedIndex={selectedIndex}
          highlightedBandId={highlightedBandId}
          isLoadingVersion={isLoadingVersion}
          onSelectIndex={onSelectIndex}
          onClearSelection={onClearSelection}
        />
      )}
    </div>
  );
}
