import { useEffect } from 'react';
import { RetryLaterError } from './api';

export function useResetAfterRetry({ error, reset }: { error: Error | null; reset: () => void }): void {
  useEffect(() => {
    if (!(error instanceof RetryLaterError)) return;
    const timer = setTimeout(reset, error.retryAfterMs);
    return () => clearTimeout(timer);
  }, [error, reset]);
}
