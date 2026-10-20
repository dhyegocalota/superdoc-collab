import { SECOND_MS } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';

export function useElapsedSeconds(startedAt: number): number {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), SECOND_MS);
    return () => clearInterval(interval);
  }, []);

  return Math.max(0, Math.floor((nowMs - startedAt) / SECOND_MS));
}
