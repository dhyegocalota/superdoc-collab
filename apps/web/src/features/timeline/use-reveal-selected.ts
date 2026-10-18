import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const SMOOTH_SCROLL: ScrollBehavior = 'smooth';
const INSTANT_SCROLL: ScrollBehavior = 'auto';

enum InputSource {
  Pointer = 'pointer',
  Keyboard = 'keyboard',
}

function isInsideScroller(target: HTMLElement): boolean {
  const scroller = target.parentElement;
  if (!scroller) return false;
  const targetRect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return targetRect.top >= scrollerRect.top && targetRect.bottom <= scrollerRect.bottom;
}

export function useRevealSelected({
  targetRef,
  selectedIndex,
}: {
  targetRef: RefObject<HTMLElement | null>;
  selectedIndex: number | null;
}): void {
  const behavior = useReducedMotion() ? INSTANT_SCROLL : SMOOTH_SCROLL;
  const lastInput = useRef(InputSource.Pointer);
  const previousIndex = useRef(selectedIndex);

  useEffect(() => {
    function rememberPointer(): void {
      lastInput.current = InputSource.Pointer;
    }
    function rememberKeyboard(): void {
      lastInput.current = InputSource.Keyboard;
    }
    window.addEventListener('pointerdown', rememberPointer, true);
    window.addEventListener('keydown', rememberKeyboard, true);
    return () => {
      window.removeEventListener('pointerdown', rememberPointer, true);
      window.removeEventListener('keydown', rememberKeyboard, true);
    };
  }, []);

  useEffect(() => {
    const hasChanged = selectedIndex !== null && selectedIndex !== previousIndex.current;
    previousIndex.current = selectedIndex;
    const target = targetRef.current;
    if (!hasChanged || !target) return;
    const isKeyboardWithHeaderInView = lastInput.current === InputSource.Keyboard && isInsideScroller(target);
    if (isKeyboardWithHeaderInView) return;
    target.scrollIntoView({ block: 'nearest', behavior });
  }, [selectedIndex]);
}
