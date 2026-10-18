import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const SMOOTH_SCROLL: ScrollBehavior = 'smooth';
const INSTANT_SCROLL: ScrollBehavior = 'auto';

export function useRevealSelected({
  targetRef,
  selectedIndex,
  selectionCount,
}: {
  targetRef: RefObject<HTMLElement | null>;
  selectedIndex?: number | null;
  selectionCount?: number;
}): void {
  const behavior = useReducedMotion() ? INSTANT_SCROLL : SMOOTH_SCROLL;
  const isPointerPressed = useRef(false);
  const previousIndex = useRef(selectedIndex);

  useEffect(() => {
    function press(): void {
      isPointerPressed.current = true;
    }
    function release(): void {
      isPointerPressed.current = false;
    }
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    return () => {
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
    };
  }, []);

  useEffect(() => {
    const hasChanged = selectedIndex !== null && selectedIndex !== previousIndex.current;
    previousIndex.current = selectedIndex;
    const target = targetRef.current;
    if (!hasChanged || !isPointerPressed.current || !target) return;
    target.scrollIntoView({ block: 'nearest', behavior });
  }, [selectedIndex]);
}
