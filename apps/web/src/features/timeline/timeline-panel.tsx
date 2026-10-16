import { DocumentRole } from '@superdoc-history/types';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { BinEdits } from './bin-edits';
import { FilterBox } from './filter-box';
import { Streamgraph } from './streamgraph';
import { REFRESH_TOPICS_LABEL, RESIZE_PANEL_LABEL, TIMELINE_HEADING } from './timeline-copy';
import { TimelineNotices } from './timeline-notices';
import { TopEdits } from './top-edits';
import { useElementWidth } from './use-element-width';
import { MIN_EDITOR_WIDTH, MIN_PANEL_WIDTH, PANEL_RESIZE_STEP, usePanelWidth } from './use-panel-width';
import { useRefreshTopics } from './use-topics';
import { useSummaries } from './use-summaries';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

enum ResizeKey {
  Widen = 'ArrowLeft',
  Narrow = 'ArrowRight',
}

const PRIMARY_BUTTON_PRESSED = 1;

type TimelinePanelProps = { documentId: string; role: DocumentRole; onTravel: (binStart: number) => void; onBackToLive: () => void };

function ResizeHandle({ width, resizeTo, resizeBy }: { width: number; resizeTo: (next: number) => void; resizeBy: (delta: number) => void }) {
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
      aria-valuemax={window.innerWidth - MIN_EDITOR_WIDTH}
      tabIndex={0}
      className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-ring focus-visible:bg-ring lg:block"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    />
  );
}

export function TimelinePanel({ documentId, role, onTravel, onBackToLive }: TimelinePanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartWidth = useElementWidth(chartRef);
  const { width, resizeTo, resizeBy } = usePanelWidth();
  const { search } = useTimelineSearch();
  const [selectedTime, setSelectedTime] = useState<number | null>(search.at);
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen });
  const { data: summaries } = useSummaries({ documentId, isOpen });
  const refresh = useRefreshTopics(documentId);
  const canRefresh = role !== DocumentRole.Reader;
  const ToggleIcon = isOpen ? PanelRightClose : PanelRightOpen;
  const hasFilter = search.filter.term !== null || search.filter.author !== null;
  const selectedIndex = timeline && selectedTime !== null ? timeline.bins.findIndex((bin) => selectedTime >= bin.start && selectedTime < bin.start + timeline.binMs) : -1;
  const selectedBin = timeline && selectedIndex >= 0 ? timeline.bins[selectedIndex] : undefined;

  useEffect(() => {
    setSelectedTime(search.at);
  }, [search.at]);

  function selectIndex(index: number): void {
    const bin = timeline!.bins[index]!;
    setSelectedTime(bin.start);
    if (bin.versionSequence !== null) onTravel(bin.start);
  }

  function clearSelection(): void {
    setSelectedTime(null);
    onBackToLive();
  }

  return (
    <aside className="flex w-full shrink-0 border-t lg:w-[var(--panel-width)] lg:border-t-0 lg:border-l" style={{ '--panel-width': `${width}px` } as CSSProperties}>
      <ResizeHandle width={width} resizeTo={resizeTo} resizeBy={resizeBy} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 p-2">
          <h2 className="px-2 text-sm font-medium">{TIMELINE_HEADING}</h2>
          <div className="flex items-center gap-1">
            {isOpen && canRefresh && (
              <Button type="button" variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
                {REFRESH_TOPICS_LABEL}
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label={TIMELINE_TOGGLE_LABEL} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
              <ToggleIcon />
            </Button>
          </div>
        </header>
        {isOpen && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {refresh.isError && <p role="alert" className="text-sm text-destructive">{refresh.error.message}</p>}
            {timeline && <TimelineNotices timeline={timeline} hasFilter={hasFilter} canRefresh={canRefresh} onRetry={() => refresh.mutate()} />}
            <div ref={chartRef}>
              {timeline && chartWidth > 0 && (
                <Streamgraph
                  timeline={timeline}
                  width={chartWidth}
                  selectedIndex={selectedBin ? selectedIndex : null}
                  highlightedBandId={search.topic}
                  onSelectIndex={selectIndex}
                  onClearSelection={clearSelection}
                />
              )}
            </div>
            <FilterBox />
            {timeline && selectedBin && <BinEdits documentId={documentId} timeline={timeline} bin={selectedBin} filter={search.filter} />}
            {timeline && !selectedBin && <TopEdits timeline={timeline} summaries={summaries} />}
          </div>
        )}
      </div>
    </aside>
  );
}
