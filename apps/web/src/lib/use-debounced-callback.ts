import { useEffect, useMemo, useRef } from 'react';

export function useDebouncedCallback<Args extends unknown[]>({ callback, delayMs }: { callback: (...args: Args) => void; delayMs: number }): { schedule: (...args: Args) => void; cancel: () => void } {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useMemo(() => {
    function cancel(): void {
      clearTimeout(timerRef.current);
    }

    function schedule(...args: Args): void {
      cancel();
      timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
    }

    return { schedule, cancel };
  }, [delayMs]);
}
