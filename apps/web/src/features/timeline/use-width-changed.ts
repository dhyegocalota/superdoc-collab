import { useEffect, useRef } from 'react';

export function useWidthChanged(width: number): boolean {
  const previousWidth = useRef(width);
  useEffect(() => {
    previousWidth.current = width;
  });
  return previousWidth.current !== width;
}
