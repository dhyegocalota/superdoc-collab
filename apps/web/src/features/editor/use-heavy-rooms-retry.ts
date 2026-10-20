import { ConnectionFailureReason, HEAVY_ROOMS_RETRY_AFTER_MS, HEAVY_ROOMS_USER_CAP_MESSAGE } from '@superdoc-collab/types';
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
  const latestReload = useRef(reload);

  useEffect(() => {
    latestReload.current = reload;
  });

  useEffect(() => {
    const isBudgetRefusal = failureReason === ConnectionFailureReason.HeavyRoomsFull && failureMessage !== HEAVY_ROOMS_USER_CAP_MESSAGE;
    if (!isBudgetRefusal) return;
    const timer = setTimeout(() => latestReload.current(), HEAVY_ROOMS_RETRY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [failureReason, failureMessage]);
}
