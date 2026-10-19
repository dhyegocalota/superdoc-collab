import { useChangePulse } from './use-change-pulse';
import { PULSE_STYLE } from './streamgraph-pulse';
import { cn } from '@/lib/utils';
import { useLiveAnnouncement } from './use-live-announcement';
import type { TimelineChange } from './use-timeline-change';

const IDLE_DOT_KEY = 'idle';

export function LiveCue({ change }: { change: TimelineChange | null }) {
  const pulse = useChangePulse({ change, isSuppressed: false });
  const announcement = useLiveAnnouncement({ change });
  return (
    <span className="inline-flex items-center">
      <span
        key={pulse ? pulse.token : IDLE_DOT_KEY}
        aria-hidden
        className={cn('size-2 rounded-full bg-online/50', pulse && 'live-cue-breath bg-online motion-reduce:animate-none')}
        style={PULSE_STYLE}
      />
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </span>
  );
}
