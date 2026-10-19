import { useEffect, useState } from 'react';

export function useDelayedReveal({ delayMs, resetKey }: { delayMs: number; resetKey: string }): boolean {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setRevealedKey(resetKey), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, resetKey]);

  return revealedKey === resetKey;
}
