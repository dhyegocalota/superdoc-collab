import { DocumentRole, type DocumentTimeline, type EditSelection, type TimelineBin } from '@superdoc-collab/types';
import { cellVolume } from '@superdoc-collab/history/timeline';
import { useEffect, useRef, useState } from 'react';
import { MEDIUM_BREAKPOINT_PX } from '@/lib/breakpoints';
import { formatBinRange } from '@/lib/format-date-time';
import { useElementWidth } from '@/lib/use-element-width';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { useMinWidth } from '@/lib/use-min-width';
import { useTimeZone } from '@/lib/use-time-zone';
import { cn } from '@/lib/utils';
import { binContaining } from './bin-containing';
import { BottomPanelBody } from './bottom-panel-body';
import { PanelChart } from './panel-chart';
import { PanelEdits } from './panel-edits';
import { PanelEmptyState } from './panel-empty-state';
import { PanelFilter } from './panel-filter';
import { PanelHeader } from './panel-header';
import { PanelState } from './panel-layout';
import { ResizeHandle } from './resize-handle';
import { timelineStamp } from './selection-summary';
import { SelectedHeader, type SelectedHeaderSelection } from './selected-header';
import { SelectionSummaryCard } from './selection-summary-card';
import { SidePanelBody } from './side-panel-body';
import { TimelineCollapsedBar } from './timeline-collapsed-bar';
import { TimelineNotices } from './timeline-notices';
import { useBinSelection } from './use-bin-selection';
import { usePanelFrame } from './use-panel-frame';
import { PanelPosition } from './use-panel-position';
import type { SummarizeControl } from './use-summarize';
import { useSelectionSummary } from './use-selection-summary';
import { useSummaries } from './use-summaries';
import { useRevealSelected } from './use-reveal-selected';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

type TimelinePanelProps = {
  documentId: string;
  role: DocumentRole;
  position: PanelPosition;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summarize: SummarizeControl;
  isLoadingVersion: boolean;
  lastEditAt: number | null;
  onTravel: (binStart: number) => void;
  onBackToLive: () => void;
};

const FRAME_CLASSES: Record<PanelPosition, Record<PanelState, string>> = {
  [PanelPosition.Bottom]: { [PanelState.Open]: 'w-full flex-col border-t', [PanelState.Collapsed]: 'w-full flex-col border-t' },
  [PanelPosition.Side]: { [PanelState.Open]: 'border-l w-[var(--panel-width)]', [PanelState.Collapsed]: 'border-l w-auto' },
};

function selectionOf({ timeline, bin }: { timeline: DocumentTimeline; bin: TimelineBin }): SelectedHeaderSelection {
  return {
    rangeLabel: formatBinRange({ start: bin.start, end: bin.end, binMs: timeline.binMs, timeZone: timeline.timeZone }),
    volume: Object.values(bin.byBand).reduce((total, cell) => total + cellVolume(cell), 0),
  };
}

export function TimelinePanel({
  documentId,
  role,
  position,
  isOpen,
  onOpenChange,
  summarize,
  isLoadingVersion,
  lastEditAt,
  onTravel,
  onBackToLive,
}: TimelinePanelProps) {
  const isBottom = position === PanelPosition.Bottom;
  const { ref: chartRef, width: chartWidth } = useElementWidth();
  const { areaRef, resize, style } = usePanelFrame({ position, isOpen });
  const { search } = useTimelineSearch();
  const {
    data: timeline,
    isPending: isTimelinePending,
    dataUpdatedAt: timelineUpdatedAt,
  } = useTimeline({ documentId, filter: search.filter, isOpen: isOpen || isBottom });
  const isPhoneLayout = useIsPhoneLayout();
  const isStackedLayout = !useMinWidth(MEDIUM_BREAKPOINT_PX);
  const { selectedIndex, selectedBin, selectIndex, clearSelection } = useBinSelection({
    timeline,
    at: search.at,
    onTravel: isPhoneLayout ? null : onTravel,
    onBackToLive,
  });
  const headerRef = useRef<HTMLDivElement>(null);
  const [selectionCount, setSelectionCount] = useState(0);
  useRevealSelected({ targetRef: headerRef, selectionCount });
  const { data: summaries } = useSummaries({ documentId, isOpen });
  const canEdit = role !== DocumentRole.Reader;
  const hasFilter = search.filter.term !== null || search.filter.author !== null;
  const selection: EditSelection = {
    term: search.filter.term,
    author: search.filter.author,
    topic: search.topic,
    at: selectedBin ? selectedBin.start : null,
  };
  const selectionKey = JSON.stringify(selection);

  const isTimelineLoaded = timeline !== undefined;

  useEffect(() => {
    if (!isTimelineLoaded) return;
    summarize.showSelection(selection);
  }, [selectionKey, isTimelineLoaded]);

  const { timeZone: preferredTimeZone } = useTimeZone();
  const binMs = timeline ? timeline.binMs : null;
  const timeZone = timeline ? timeline.timeZone : preferredTimeZone;
  const { data: selectionSummary } = useSelectionSummary({
    documentId,
    selection,
    binMs,
    timeZone,
    isOpen,
    timelineStamp: timeline ? timelineStamp(timeline) : null,
  });
  const panelState = isOpen ? PanelState.Open : PanelState.Collapsed;

  const isLogAhead = lastEditAt !== null && timelineUpdatedAt <= lastEditAt;
  const isDocumentEmpty = timeline !== undefined && timeline.bins.length === 0 && !timeline.projection.isBehind && !isLogAhead;
  const isBodyShown = isOpen && !isDocumentEmpty;
  const notices = timeline && (
    <TimelineNotices timeline={timeline} hasFilter={hasFilter} canRefresh={canEdit} onRetry={summarize.summarize} />
  );
  const chart = (
    <PanelChart
      chartRef={chartRef}
      chartWidth={chartWidth}
      timeline={timeline}
      isTimelinePending={isTimelinePending}
      selectedIndex={selectedIndex}
      highlightedBandId={search.topic}
      isLoadingVersion={isPhoneLayout && isLoadingVersion}
      onSelectIndex={selectAndCount}
      onClearSelection={clearSelection}
    />
  );
  const isSelectedBinShown = selectedIndex !== null && binContaining({ timeline, time: search.at })?.index === selectedIndex;
  const canViewVersion = selectedBin !== null && selectedBin.versionSequence !== null && !isSelectedBinShown;
  function selectAndCount(index: number): void {
    setSelectionCount((count) => count + 1);
    selectIndex(index);
  }

  function viewSelectedVersion(): void {
    if (!selectedBin) return;
    onTravel(selectedBin.start);
  }

  const header = isPhoneLayout && (
    <SelectedHeader
      ref={headerRef}
      selection={timeline && selectedBin ? selectionOf({ timeline, bin: selectedBin }) : null}
      canViewVersion={canViewVersion}
      isViewVersionDisabled={isLoadingVersion}
      onClear={clearSelection}
      onViewVersion={viewSelectedVersion}
    />
  );
  const card = timeline && (
    <SelectionSummaryCard view={selectionSummary} summarize={summarize} canRequest={canEdit} authors={timeline.authors} />
  );
  const edits = timeline && (
    <PanelEdits documentId={documentId} timeline={timeline} selectedBin={selectedBin} filter={search.filter} summaries={summaries} />
  );

  return (
    <aside
      ref={areaRef}
      data-state={panelState}
      data-position={position}
      className={cn('flex shrink-0', FRAME_CLASSES[position][panelState])}
      style={style}
    >
      {isOpen && <ResizeHandle position={position} {...resize} />}
      {isBottom && !isOpen && <TimelineCollapsedBar timeline={timeline} onExpand={() => onOpenChange(true)} />}
      {(isOpen || !isBottom) && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PanelHeader position={position} isOpen={isOpen} onOpenChange={onOpenChange} />
          {isOpen && isDocumentEmpty && <PanelEmptyState />}
          {isBodyShown && !isBottom && <SidePanelBody notices={notices} chart={chart} filter={<PanelFilter />} card={card} edits={edits} />}
          {isBodyShown && isBottom && (
            <BottomPanelBody
              isStackedLayout={isStackedLayout}
              notices={notices}
              chart={chart}
              header={header}
              filter={<PanelFilter />}
              card={card}
              edits={edits}
            />
          )}
        </div>
      )}
    </aside>
  );
}
