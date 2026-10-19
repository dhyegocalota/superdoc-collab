import { TimelineSearchParam, type DocumentTimeline, type TimelineBand } from '@superdoc-collab/types';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { maxBandVolume } from './max-band-volume';
import { PULSE_STYLE } from './streamgraph-pulse';
import { TIMELINE_HEADING } from './timeline-copy';
import { bandsByVolume } from './top-edits';
import { TopicSwatch } from './topic-swatch';
import { useChangePulse } from './use-change-pulse';
import type { TimelineChange } from './use-timeline-change';
import { useTimelineSearch } from './use-timeline-search';

const MAX_BAR_CHIPS = 3;
export const TIMELINE_COLLAPSED_BAR_TEST_ID = 'timeline-collapsed-bar';

export function TimelineCollapsedBar({
  timeline,
  change,
  onExpand,
}: {
  timeline: DocumentTimeline | undefined;
  change: TimelineChange | null;
  onExpand: () => void;
}) {
  const { update } = useTimelineSearch();
  const pulse = useChangePulse({ change, isSuppressed: useReducedMotion() });
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
              className="relative inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <TopicSwatch band={band} maxVolume={maxVolume} />
              <span className="truncate">{band.name}</span>
              {pulse && pulse.bandId === band.id && (
                <span
                  key={pulse.token}
                  aria-hidden
                  className="chip-pulse-ring pointer-events-none absolute inset-0 rounded-full bg-foreground/20"
                  style={PULSE_STYLE}
                />
              )}
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
