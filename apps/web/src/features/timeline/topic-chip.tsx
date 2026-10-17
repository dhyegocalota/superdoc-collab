import { TimelineSearchParam, type TimelineBand } from '@superdoc-history/types';
import { cn } from '@/lib/utils';
import { TopicSwatch } from './topic-swatch';
import { useTimelineSearch } from './use-timeline-search';

export function TopicChip({ band, maxVolume }: { band: TimelineBand; maxVolume: number }) {
  const { search, update } = useTimelineSearch();
  const isActive = search.topic === band.id;

  function toggle(): void {
    update({ changes: { [TimelineSearchParam.Topic]: isActive ? null : band.id }, replace: true });
  }

  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isActive && 'bg-accent',
      )}
    >
      <TopicSwatch band={band} maxVolume={maxVolume} />
      {band.name}
    </button>
  );
}
