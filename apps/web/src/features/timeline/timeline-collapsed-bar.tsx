import { TimelineSearchParam, type DocumentTimeline, type TimelineBand } from '@superdoc-collab/types';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { maxBandVolume } from './max-band-volume';
import { TIMELINE_HEADING } from './timeline-copy';
import { bandsByVolume } from './top-edits';
import { TopicSwatch } from './topic-swatch';
import type { TimelineChange } from './use-timeline-change';
import { useTimelineSearch } from './use-timeline-search';

const MAX_BAR_CHIPS = 3;
export const TIMELINE_COLLAPSED_BAR_TEST_ID = 'timeline-collapsed-bar';

export function TimelineCollapsedBar({
  timeline,
  change: _change,
  onExpand,
}: {
  timeline: DocumentTimeline | undefined;
  change: TimelineChange | null;
  onExpand: () => void;
}) {
  const { update } = useTimelineSearch();
  const bands = timeline ? bandsByVolume(timeline).slice(0, MAX_BAR_CHIPS) : [];
  const maxVolume = timeline ? maxBandVolume(timeline) : 0;

  function filterBy(band: TimelineBand): void {
    update({ changes: { [TimelineSearchParam.Topic]: band.id }, replace: true });
    onExpand();
  }

  return (
    <div data-testid={TIMELINE_COLLAPSED_BAR_TEST_ID} className="flex h-11 min-w-0 flex-1 items-center gap-2 px-2">
      <h2 className="px-2 text-sm font-medium">{TIMELINE_HEADING}</h2>
      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {bands.map((band) => (
          <li key={band.id} className="flex min-w-0 shrink">
            <button
              type="button"
              onClick={() => filterBy(band)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <TopicSwatch band={band} maxVolume={maxVolume} />
              <span className="truncate">{band.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="icon" aria-label={TIMELINE_TOGGLE_LABEL} aria-expanded={false} onClick={onExpand}>
        <ChevronUp />
      </Button>
    </div>
  );
}
