import { useEffect, useState } from 'react';
import { minWidthQuery } from './breakpoints';

export function useMinWidth(pixels: number): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(minWidthQuery(pixels)).matches);

  useEffect(() => {
    const query = window.matchMedia(minWidthQuery(pixels));
    function update(): void {
      setMatches(query.matches);
    }
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [pixels]);

  return matches;
}
