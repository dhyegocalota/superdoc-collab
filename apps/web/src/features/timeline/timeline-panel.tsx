import { DocumentRole, type DocumentTimeline, type EditSelection, type TimelineBin } from '@superdoc-collab/types';
import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, type LucideIcon } from 'lucide-react';
import { cellVolume } from '@superdoc-collab/history/timeline';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { TimeZoneLabel } from '@/features/settings/time-zone-label';
import { MEDIUM_BREAKPOINT_PX } from '@/lib/breakpoints';
import { formatBinRange } from '@/lib/format-date-time';
import { useElementWidth } from '@/lib/use-element-width';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { useMinWidth } from '@/lib/use-min-width';
import { useTimeZone } from '@/lib/use-time-zone';
import { cn } from '@/lib/utils';
import { BinEdits } from './bin-edits';
import { binContaining } from './bin-containing';
import { FilterBox } from './filter-box';
import { PanelPositionToggle } from './panel-position-toggle';
import { ResizeHandle } from './resize-handle';
import { timelineStamp } from './selection-summary';
import { SelectedHeader, type SelectedHeaderSelection } from './selected-header';
import { SelectionSummaryCard } from './selection-summary-card';
import { Streamgraph } from './streamgraph';
import { CHART_HEIGHT } from './streamgraph-layout';
import { TimelineCollapsedBar } from './timeline-collapsed-bar';
import { LOADING_TIMELINE_LABEL, TIMELINE_HEADING } from './timeline-copy';
import { TimelineNotices } from './timeline-notices';
import { TopEdits } from './top-edits';
import { useBinSelection } from './use-bin-selection';
import { PanelPosition, usePanelPosition } from './use-panel-position';
import { MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH, useAreaHeight, useIsCompact, usePanelHeight, usePanelWidth } from './use-panel-width';
import type { SummarizeControl } from './use-summarize';
import { useSelectionSummary } from './use-selection-summary';
import { useSummaries } from './use-summaries';
import { useRevealSelected } from './use-reveal-selected';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

export enum PanelState {
  Open = 'open',
  Collapsed = 'collapsed',
}

export enum PanelColumn {
  Chart = 'chart',
  List = 'list',
}

type TimelinePanelProps = {
  documentId: string;
  role: DocumentRole;
  position: PanelPosition;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summarize: SummarizeControl;
  isLoadingVersion: boolean;
  onTravel: (binStart: number) => void;
  onBackToLive: () => void;
};

const COLLAPSE_ICONS: Record<PanelPosition, Record<PanelState, LucideIcon>> = {
  [PanelPosition.Bottom]: { [PanelState.Open]: ChevronDown, [PanelState.Collapsed]: ChevronUp },
  [PanelPosition.Side]: { [PanelState.Open]: PanelRightClose, [PanelState.Collapsed]: PanelRightOpen },
};

const FRAME_CLASSES: Record<PanelPosition, Record<PanelState, string>> = {
  [PanelPosition.Bottom]: { [PanelState.Open]: 'w-full flex-col border-t', [PanelState.Collapsed]: 'w-full flex-col border-t' },
  [PanelPosition.Side]: { [PanelState.Open]: 'border-l w-[var(--panel-width)]', [PanelState.Collapsed]: 'border-l w-auto' },
};

function PanelHeader({ position, isOpen, onOpenChange }: Pick<TimelinePanelProps, 'position' | 'isOpen' | 'onOpenChange'>) {
  const { choosePosition, canChoose } = usePanelPosition();
  const panelState = isOpen ? PanelState.Open : PanelState.Collapsed;
  const CollapseIcon = COLLAPSE_ICONS[position][panelState];
  const isRail = position === PanelPosition.Side && !isOpen;
  return (
    <header className={cn('flex items-center gap-2 p-2', isRail && 'flex-col')}>
      <h2 className={cn('px-2 text-sm font-medium', isRail && 'sr-only')}>{TIMELINE_HEADING}</h2>
      {isOpen && (
        <span className="hidden min-w-0 sm:block">
          <TimeZoneLabel />
        </span>
      )}
      {isOpen && <span className="flex-1" />}
      {isOpen && canChoose && <PanelPositionToggle position={position} onChoose={choosePosition} />}
      <Button variant="ghost" size="icon" aria-label={TIMELINE_TOGGLE_LABEL} aria-expanded={isOpen} onClick={() => onOpenChange(!isOpen)}>
        <CollapseIcon />
      </Button>
    </header>
  );
}

function selectionOf({ timeline, bin }: { timeline: DocumentTimeline; bin: TimelineBin }): SelectedHeaderSelection {
  return {
    rangeLabel: formatBinRange({ start: bin.start, end: bin.end, binMs: timeline.binMs, timeZone: timeline.timeZone }),
    volume: Object.values(bin.byBand).reduce((total, cell) => total + cellVolume(cell), 0),
  };
}

function ignoreTravel(): void {}

export function TimelinePanel({
  documentId,
  role,
  position,
  isOpen,
  onOpenChange,
  summarize,
  isLoadingVersion,
  onTravel,
  onBackToLive,
}: TimelinePanelProps) {
  const isBottom = position === PanelPosition.Bottom;
  const { ref: chartRef, width: chartWidth } = useElementWidth();
  const { ref: areaRef, height: areaHeight } = useAreaHeight();
  const sideSize = usePanelWidth();
  const isCompact = useIsCompact();
  const bottomSize = usePanelHeight({ areaHeight, isCompact });
  const { search } = useTimelineSearch();
  const { data: timeline, isPending: isTimelinePending } = useTimeline({ documentId, filter: search.filter, isOpen: isOpen || isBottom });
  const isPhoneLayout = useIsPhoneLayout();
  const isStackedLayout = !useMinWidth(MEDIUM_BREAKPOINT_PX);
  const { selectedIndex, selectedBin, selectIndex, clearSelection } = useBinSelection({
    timeline,
    at: search.at,
    onTravel: isPhoneLayout ? ignoreTravel : onTravel,
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
  const resize = isBottom
    ? {
        size: bottomSize.height,
        minSize: MIN_PANEL_HEIGHT,
        maxSize: bottomSize.maxHeight,
        resizeTo: bottomSize.resizeTo,
        resizeBy: bottomSize.resizeBy,
      }
    : {
        size: sideSize.width,
        minSize: MIN_PANEL_WIDTH,
        maxSize: sideSize.maxWidth,
        resizeTo: sideSize.resizeTo,
        resizeBy: sideSize.resizeBy,
      };
  const bottomStyle: CSSProperties | undefined = isOpen ? { height: `${bottomSize.height}px` } : undefined;
  const sideStyle = { '--panel-width': `${sideSize.width}px` } as CSSProperties;

  const notices = timeline && (
    <TimelineNotices timeline={timeline} hasFilter={hasFilter} isLogAhead={false} canRefresh={canEdit} onRetry={summarize.summarize} />
  );
  const chart = (
    <div ref={chartRef} className="shrink-0 overflow-visible">
      {isTimelinePending && (
        <Skeleton role="status" aria-label={LOADING_TIMELINE_LABEL} className="w-full" style={{ height: CHART_HEIGHT }} />
      )}
      {timeline && chartWidth > 0 && (
        <Streamgraph
          timeline={timeline}
          width={chartWidth}
          selectedIndex={selectedIndex}
          highlightedBandId={search.topic}
          isLoadingVersion={isPhoneLayout && isLoadingVersion}
          onSelectIndex={selectAndCount}
          onClearSelection={clearSelection}
        />
      )}
    </div>
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
  const filter = (
    <div className="w-full md:ml-auto md:w-72">
      <FilterBox />
    </div>
  );
  const card = timeline && (
    <SelectionSummaryCard view={selectionSummary} summarize={summarize} canRequest={canEdit} authors={timeline.authors} />
  );
  const edits = timeline && (
    <>
      {selectedBin && <BinEdits documentId={documentId} timeline={timeline} bin={selectedBin} filter={search.filter} />}
      {!selectedBin && <TopEdits timeline={timeline} summaries={summaries} />}
    </>
  );

  return (
    <aside
      ref={areaRef}
      data-state={panelState}
      data-position={position}
      className={cn('flex shrink-0', FRAME_CLASSES[position][panelState])}
      style={isBottom ? bottomStyle : sideStyle}
    >
      {isOpen && <ResizeHandle position={position} {...resize} />}
      {isBottom && !isOpen && <TimelineCollapsedBar timeline={timeline} onExpand={() => onOpenChange(true)} />}
      {(isOpen || !isBottom) && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PanelHeader position={position} isOpen={isOpen} onOpenChange={onOpenChange} />
          {isOpen && !isBottom && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {notices}
              {chart}
              {filter}
              {card}
              {edits}
            </div>
          )}
          {isOpen && isBottom && (
            <div
              data-panel-body
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-6 md:overflow-hidden"
            >
              <div
                data-column={PanelColumn.Chart}
                className="contents md:flex md:min-h-0 md:min-w-0 md:flex-col md:gap-3 md:overflow-y-auto"
              >
                {chart}
                {isStackedLayout && header}
                {filter}
              </div>
              <div
                data-column={PanelColumn.List}
                className="contents md:flex md:min-h-0 md:min-w-0 md:flex-col md:gap-3 md:overflow-y-auto"
              >
                {!isStackedLayout && header}
                {notices}
                {card}
                {edits}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
