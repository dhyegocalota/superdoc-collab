import { CARET_ON_OPEN_TIMEOUT_MS } from '@superdoc-collab/types';
import { useEffect, type RefObject } from 'react';

const FIRST_FRAGMENT_SELECTOR = '.superdoc-page .superdoc-fragment';
const CARET_OFFSET_PX = 2;
const PRIMARY_BUTTON = 0;
const POINTER_IDENTIFIER = 1;
const POINTER_TYPE = 'mouse';

function pressAtDocumentStart({ fragment, root }: { fragment: Element; root: HTMLElement }): void {
  const bounds = fragment.getBoundingClientRect();
  const position = { clientX: bounds.left + CARET_OFFSET_PX, clientY: bounds.top + bounds.height / 2 };
  const target = document.elementFromPoint(position.clientX, position.clientY);
  if (!target || !root.contains(target)) return;
  const pressed = { ...position, bubbles: true, cancelable: true, composed: true, button: PRIMARY_BUTTON, buttons: 1 };
  const released = { ...pressed, buttons: 0 };
  const pointer = { pointerId: POINTER_IDENTIFIER, pointerType: POINTER_TYPE, isPrimary: true };
  target.dispatchEvent(new PointerEvent('pointerdown', { ...pressed, ...pointer }));
  target.dispatchEvent(new MouseEvent('mousedown', pressed));
  target.dispatchEvent(new PointerEvent('pointerup', { ...released, ...pointer }));
  target.dispatchEvent(new MouseEvent('mouseup', released));
  target.dispatchEvent(new MouseEvent('click', released));
}

export function useCaretOnOpen({ containerRef, isEnabled }: { containerRef: RefObject<HTMLElement | null>; isEnabled: boolean }): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isEnabled) return;
    const root: HTMLElement = container;
    const startedAt = performance.now();
    let frame = 0;
    function placeCaret(): void {
      if (performance.now() - startedAt > CARET_ON_OPEN_TIMEOUT_MS) return;
      const fragment = root.querySelector(FIRST_FRAGMENT_SELECTOR);
      if (!fragment) {
        frame = requestAnimationFrame(placeCaret);
        return;
      }
      const isFocusElsewhere = document.activeElement !== document.body && !root.contains(document.activeElement);
      const isCaretPlaced = document.activeElement !== null && root.contains(document.activeElement);
      if (isFocusElsewhere || isCaretPlaced) return;
      pressAtDocumentStart({ fragment, root });
    }
    frame = requestAnimationFrame(placeCaret);
    return () => cancelAnimationFrame(frame);
  }, [containerRef, isEnabled]);
}
