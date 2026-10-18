import { LAST_EDIT_MARK_INTERVAL_MS } from '@superdoc-collab/types';
import { useCallback, useRef, useState } from 'react';

export function useLastEditAt(): { lastEditAt: number | null; markEdit: () => void } {
  const [lastEditAt, setLastEditAt] = useState<number | null>(null);
  const markedAt = useRef<number | null>(null);

  const markEdit = useCallback((): void => {
    const now = Date.now();
    const isWithinInterval = markedAt.current !== null && now - markedAt.current < LAST_EDIT_MARK_INTERVAL_MS;
    if (isWithinInterval) return;
    markedAt.current = now;
    setLastEditAt(now);
  }, []);

  return { lastEditAt, markEdit };
}
