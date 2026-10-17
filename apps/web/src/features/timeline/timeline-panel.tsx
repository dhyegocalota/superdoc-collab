import { DocumentRole, type DocumentTimeline, type EditSelection } from '@superdoc-history/types';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { cn } from '@/lib/utils';
import { BinEdits } from './bin-edits';
import { FilterBox } from './filter-box';
import { errorForSelection, selectionVolume, summarizeDisabledReason, timelineStamp } from './selection-summary';
import { SelectionSummaryCard } from './selection-summary-card';
import { SummarizeEditsButton } from './summarize-edits-button';
import { Streamgraph } from './streamgraph';
import {
  NOTHING_TO_GROUP_MESSAGE,
  REGROUP_TOPICS_LABEL,
  REGROUPING_TOPICS_MESSAGE,
  RESIZE_PANEL_LABEL,
  TIMELINE_HEADING,
} from './timeline-copy';
import { TimelineNotices } from './timeline-notices';
import { TopEdits } from './top-edits';
import { useElementWidth } from '@/lib/use-element-width';
import { useBinSelection } from './use-bin-selection';
import { MIN_PANEL_WIDTH, PANEL_RESIZE_STEP, usePanelWidth } from './use-panel-width';
import { useSelectionSummary, useSummarizeEdits } from './use-selection-summary';
import { useRefreshTopics } from './use-topics';
import { useSummaries } from './use-summaries';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

enum ResizeKey {
  Widen = 'ArrowLeft',
  Narrow = 'ArrowRight',
}

const PRIMARY_BUTTON_PRESSED = 1;

export enum PanelState {
  Open = 'open',
  Collapsed = 'collapsed',
}

type TimelinePanelProps = { documentId: string; role: DocumentRole; onTravel: (binStart: number) => void; onBackToLive: () => void };

function ResizeHandle({
  width,
  maxWidth,
  resizeTo,
  resizeBy,
}: {
  width: number;
  maxWidth: number;
  resizeTo: (next: number) => void;
  resizeBy: (delta: number) => void;
}) {
  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (event.buttons !== PRIMARY_BUTTON_PRESSED) return;
    resizeTo(window.innerWidth - event.clientX);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === ResizeKey.Widen) resizeBy(PANEL_RESIZE_STEP);
    if (event.key === ResizeKey.Narrow) resizeBy(-PANEL_RESIZE_STEP);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={RESIZE_PANEL_LABEL}
      aria-valuenow={width}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={maxWidth}
      tabIndex={0}
      className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-ring focus-visible:bg-ring lg:block"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    />
  );
}

function regroupDisabledReason({ timeline, isPending }: { timeline: DocumentTimeline | undefined; isPending: boolean }): string | null {
  if (isPending) return REGROUPING_TOPICS_MESSAGE;
  if (timeline && timeline.bins.length === 0) return NOTHING_TO_GROUP_MESSAGE;
  return null;
}

export function TimelinePanel({ documentId, role, onTravel, onBackToLive }: TimelinePanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartWidth = useElementWidth(chartRef);
  const { width, maxWidth, resizeTo, resizeBy } = usePanelWidth();
  const { search } = useTimelineSearch();
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen });
  const { selectedIndex, selectedBin, selectIndex, clearSelection } = useBinSelection({ timeline, at: search.at, onTravel, onBackToLive });
  const { data: summaries } = useSummaries({ documentId, isOpen });
  const refresh = useRefreshTopics(documentId);
  const canRefresh = role !== DocumentRole.Reader;
  const ToggleIcon = isOpen ? PanelRightClose : PanelRightOpen;
  const hasFilter = search.filter.term !== null || search.filter.author !== null;
  const selection: EditSelection = {
    term: search.filter.term,
    author: search.filter.author,
    topic: search.topic,
    at: selectedBin ? selectedBin.start : null,
  };
  const binMs = timeline ? timeline.binMs : null;
  const { data: selectionSummary } = useSelectionSummary({
    documentId,
    selection,
    binMs,
    isOpen,
    timelineStamp: timeline ? timelineStamp(timeline) : null,
  });
  const summarize = useSummarizeEdits({ documentId, binMs });
  const reasonId = useId();
  const disabledReason = timeline
    ? summarizeDisabledReason({ volume: selectionVolume({ timeline, selection }), view: selectionSummary, isPending: summarize.isPending })
    : null;
  const regroupReasonId = useId();
  const regroupReason = regroupDisabledReason({ timeline, isPending: refresh.isPending });
  const summaryError = errorForSelection({ error: summarize.error, variables: summarize.variables, selection });

  return (
    <aside
      data-state={isOpen ? PanelState.Open : PanelState.Collapsed}
      className={cn(
        'flex max-h-[50dvh] w-full shrink-0 border-t lg:max-h-none lg:border-t-0 lg:border-l',
        isOpen ? 'lg:w-[var(--panel-width)]' : 'lg:w-auto',
      )}
      style={{ '--panel-width': `${width}px` } as CSSProperties}
    >
      {isOpen && <ResizeHandle width={width} maxWidth={maxWidth} resizeTo={resizeTo} resizeBy={resizeBy} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn('flex flex-wrap items-center justify-between gap-x-2 gap-y-1 p-2', !isOpen && 'lg:flex-col')}>
          <h2 className={cn('px-2 text-sm font-medium', !isOpen && 'lg:sr-only')}>{TIMELINE_HEADING}</h2>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {isOpen && canRefresh && timeline && (
              <SummarizeEditsButton disabledReason={disabledReason} reasonId={reasonId} onSummarize={() => summarize.mutate(selection)} />
            )}
            {isOpen && canRefresh && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={regroupReason !== null}
                aria-describedby={regroupReason === null ? undefined : regroupReasonId}
                onClick={() => refresh.mutate()}
              >
                {REGROUP_TOPICS_LABEL}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={TIMELINE_TOGGLE_LABEL}
              aria-expanded={isOpen}
              onClick={() => setIsOpen(!isOpen)}
            >
              <ToggleIcon />
            </Button>
          </div>
          {isOpen && canRefresh && disabledReason !== null && (
            <p id={reasonId} className="basis-full px-2 text-xs text-muted-foreground">
              {disabledReason}
            </p>
          )}
          {isOpen && canRefresh && regroupReason !== null && (
            <p id={regroupReasonId} className="basis-full px-2 text-xs text-muted-foreground">
              {regroupReason}
            </p>
          )}
        </header>
        {isOpen && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {refresh.isError && (
              <p role="alert" className="text-sm text-destructive">
                {refresh.error.message}
              </p>
            )}
            {timeline && (
              <TimelineNotices timeline={timeline} hasFilter={hasFilter} canRefresh={canRefresh} onRetry={() => refresh.mutate()} />
            )}
            <div ref={chartRef}>
              {timeline && chartWidth > 0 && (
                <Streamgraph
                  timeline={timeline}
                  width={chartWidth}
                  selectedIndex={selectedIndex}
                  highlightedBandId={search.topic}
                  onSelectIndex={selectIndex}
                  onClearSelection={clearSelection}
                />
              )}
            </div>
            <FilterBox />
            <SelectionSummaryCard
              view={selectionSummary}
              error={summaryError}
              canRequest={canRefresh}
              isPending={summarize.isPending}
              onRetry={() => summarize.mutate(selection)}
            />
            {timeline && selectedBin && <BinEdits documentId={documentId} timeline={timeline} bin={selectedBin} filter={search.filter} />}
            {timeline && !selectedBin && <TopEdits timeline={timeline} summaries={summaries} />}
          </div>
        )}
      </div>
    </aside>
  );
}
