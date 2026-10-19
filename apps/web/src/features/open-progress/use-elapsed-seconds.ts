import { SECOND_MS } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';

export function useElapsedSeconds({ resetKey, isRunning }: { resetKey: string; isRunning: boolean }): number {
  const [elapsed, setElapsed] = useState({ resetKey, seconds: 0 });

  useEffect(() => {
    if (!isRunning) return;
    const startedAt = Date.now();
    const interval = setInterval(() => setElapsed({ resetKey, seconds: Math.floor((Date.now() - startedAt) / SECOND_MS) }), SECOND_MS);
    return () => clearInterval(interval);
  }, [resetKey, isRunning]);

  if (elapsed.resetKey !== resetKey) return 0;
  return elapsed.seconds;
}
