import { SECOND_MS, secondsRoundedUp } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';

export function useCountdown(untilMs: number | null): number | null {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    if (untilMs === null) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), SECOND_MS);
    return () => clearInterval(interval);
  }, [untilMs]);

  if (untilMs === null) return null;
  return Math.max(0, secondsRoundedUp(untilMs - nowMs));
}
