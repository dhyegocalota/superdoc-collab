import { DocumentRole, type DocumentTimeline, type EditSelection } from '@superdoc-collab/types';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { TimeZoneLabel } from '@/features/settings/time-zone-label';
import { useTimeZone } from '@/lib/use-time-zone';
import { cn } from '@/lib/utils';
import { BinEdits } from './bin-edits';
import { FilterBox } from './filter-box';
import { ResizeHandle } from './resize-handle';
import { errorForSelection, selectionVolume, summarizeDisabledReason, timelineStamp } from './selection-summary';
import { SelectionSummaryCard } from './selection-summary-card';
import { SummarizeEditsButton } from './summarize-edits-button';
import { Streamgraph } from './streamgraph';
import { NOTHING_TO_GROUP_MESSAGE, REGROUP_TOPICS_LABEL, REGROUPING_TOPICS_MESSAGE, TIMELINE_HEADING } from './timeline-copy';
import { TimelineNotices } from './timeline-notices';
import { TopEdits } from './top-edits';
import { useElementWidth } from '@/lib/use-element-width';
import { useBinSelection } from './use-bin-selection';
import { usePanelWidth } from './use-panel-width';
import { useSelectionSummary, useSummarizeEdits } from './use-selection-summary';
import { useRefreshTopics } from './use-topics';
import { useSummaries } from './use-summaries';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

export enum PanelState {
  Open = 'open',
  Collapsed = 'collapsed',
}

type TimelinePanelProps = { documentId: string; role: DocumentRole; onTravel: (binStart: number) => void; onBackToLive: () => void };

function regroupDisabledReason({ timeline, isPending }: { timeline: DocumentTimeline | undefined; isPending: boolean }): string | null {
  if (isPending) return REGROUPING_TOPICS_MESSAGE;
  if (timeline && timeline.bins.length === 0) return NOTHING_TO_GROUP_MESSAGE;
  return null;
}

export function TimelinePanel({ documentId, role, onTravel, onBackToLive }: TimelinePanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { ref: chartRef, width: chartWidth } = useElementWidth();
  const { width, maxWidth, resizeTo, resizeBy } = usePanelWidth();
  const { search } = useTimelineSearch();
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen });
  const { selectedIndex, selectedBin, selectIndex, clearSelection } = useBinSelection({ timeline, at: search.at, onTravel, onBackToLive });
  const { data: summaries } = useSummaries({ documentId, isOpen });
  const refreshTopics = useRefreshTopics(documentId);
  const canEdit = role !== DocumentRole.Reader;
  const showsEditorActions = isOpen && canEdit;
  const ToggleIcon = isOpen ? PanelRightClose : PanelRightOpen;
  const hasFilter = search.filter.term !== null || search.filter.author !== null;
  const selection: EditSelection = {
    term: search.filter.term,
    author: search.filter.author,
    topic: search.topic,
    at: selectedBin ? selectedBin.start : null,
  };
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
  const summarize = useSummarizeEdits({ documentId, binMs, timeZone });
  const reasonId = useId();
  const disabledReason = timeline
    ? summarizeDisabledReason({ volume: selectionVolume({ timeline, selection }), view: selectionSummary, isPending: summarize.isPending })
    : null;
  const regroupReasonId = useId();
  const regroupReason = regroupDisabledReason({ timeline, isPending: refreshTopics.isPending });
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
            {showsEditorActions && timeline && (
              <SummarizeEditsButton disabledReason={disabledReason} reasonId={reasonId} onSummarize={() => summarize.mutate(selection)} />
            )}
            {showsEditorActions && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={regroupReason !== null}
                aria-describedby={regroupReason === null ? undefined : regroupReasonId}
                onClick={() => refreshTopics.mutate()}
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
          {isOpen && <TimeZoneLabel />}
          {showsEditorActions && disabledReason !== null && (
            <p id={reasonId} className="basis-full px-2 text-xs text-muted-foreground">
              {disabledReason}
            </p>
          )}
          {showsEditorActions && regroupReason !== null && (
            <p id={regroupReasonId} className="basis-full px-2 text-xs text-muted-foreground">
              {regroupReason}
            </p>
          )}
        </header>
        {isOpen && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {refreshTopics.isError && <ErrorMessage>{refreshTopics.error.message}</ErrorMessage>}
            {timeline && (
              <TimelineNotices timeline={timeline} hasFilter={hasFilter} canRefresh={canEdit} onRetry={() => refreshTopics.mutate()} />
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
              canRequest={canEdit}
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
