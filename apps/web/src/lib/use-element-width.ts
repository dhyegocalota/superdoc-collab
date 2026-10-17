import { useEffect, useState, type RefObject } from 'react';

export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
