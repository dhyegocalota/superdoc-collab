import { ConnectionFailureReason, HEAVY_ROOMS_RETRY_AFTER_MS } from '@superdoc-collab/types';
import { useEffect, useRef } from 'react';

export function useHeavyRoomsRetry({ failureReason, reload }: { failureReason: ConnectionFailureReason | null; reload: () => void }): void {
  const latestReload = useRef(reload);

  useEffect(() => {
    latestReload.current = reload;
  });

  useEffect(() => {
    if (failureReason !== ConnectionFailureReason.HeavyRoomsFull) return;
    const timer = setTimeout(() => latestReload.current(), HEAVY_ROOMS_RETRY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [failureReason]);
}
