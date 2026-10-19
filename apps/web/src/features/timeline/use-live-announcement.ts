import { LIVE_ANNOUNCE_MS } from '@superdoc-collab/types';
import { useEffect, useRef, useState } from 'react';
import { liveEditsLabel } from './timeline-copy';
import type { TimelineChange } from './use-timeline-change';

export function useLiveAnnouncement({ change }: { change: TimelineChange | null }): string {
  const [announcement, setAnnouncement] = useState('');
  const handledToken = useRef(change ? change.token : null);
  const pendingCount = useRef(0);
  const announcedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function announce(): void {
    setAnnouncement(liveEditsLabel(pendingCount.current));
    pendingCount.current = 0;
    announcedAt.current = Date.now();
    timer.current = null;
  }

  useEffect(() => {
    if (!change || change.token === handledToken.current) return;
    handledToken.current = change.token;
    pendingCount.current += 1;
    if (timer.current !== null) return;
    const remainingMs = LIVE_ANNOUNCE_MS - (Date.now() - announcedAt.current);
    if (remainingMs <= 0) {
      announce();
      return;
    }
    timer.current = setTimeout(announce, remainingMs);
  }, [change]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return announcement;
}
