import { ConnectionFailureReason, HEAVY_ROOMS_RETRY_AFTER_MS } from '@superdoc-collab/types';
import { useEffect, useRef } from 'react';

export function useHeavyRoomsRetry({
  failureReason,
  failureMessage,
  reload,
}: {
  failureReason: ConnectionFailureReason | null;
  failureMessage: string | null;
  reload: () => void;
}): void {
  void failureMessage;
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
