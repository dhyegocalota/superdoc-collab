import { STREAMGRAPH_PULSE_MS } from '@superdoc-collab/types';
import { useEffect, useRef, useState } from 'react';
import type { TimelineChange } from './use-timeline-change';

export function useChangePulse({ change, isSuppressed }: { change: TimelineChange | null; isSuppressed: boolean }): TimelineChange | null {
  const [pulse, setPulse] = useState<TimelineChange | null>(null);
  const handledToken = useRef(change ? change.token : null);

  useEffect(() => {
    if (!change || change.token === handledToken.current) return;
    handledToken.current = change.token;
    if (isSuppressed) {
      setPulse(null);
      return;
    }
    setPulse(change);
    const timer = setTimeout(() => setPulse(null), STREAMGRAPH_PULSE_MS);
    return () => clearTimeout(timer);
  }, [change]);

  return pulse;
}
