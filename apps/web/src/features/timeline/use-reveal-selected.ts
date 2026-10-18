import type { RefObject } from 'react';

export function useRevealSelected({
  targetRef,
  selectedIndex,
}: {
  targetRef: RefObject<HTMLElement | null>;
  selectedIndex: number | null;
}): void {
  throw new Error('useRevealSelected is not implemented');
}
