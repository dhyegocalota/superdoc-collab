import type { KeyboardEvent, PointerEvent } from 'react';
import { KeyboardKey } from '@/lib/keyboard';
import { PRIMARY_BUTTON_PRESSED } from '@/lib/pointer';
import { RESIZE_PANEL_LABEL } from './timeline-copy';
import type { PanelPosition } from './use-panel-position';
import { PANEL_RESIZE_STEP } from './use-panel-width';

export function ResizeHandle({
  size,
  minSize,
  maxSize,
  resizeTo,
  resizeBy,
}: {
  position: PanelPosition;
  size: number;
  minSize: number;
  maxSize: number;
  resizeTo: (next: number) => void;
  resizeBy: (delta: number) => void;
}) {
  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (event.buttons !== PRIMARY_BUTTON_PRESSED) return;
    resizeTo(window.innerWidth - event.clientX);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === KeyboardKey.ArrowLeft) resizeBy(PANEL_RESIZE_STEP);
    if (event.key === KeyboardKey.ArrowRight) resizeBy(-PANEL_RESIZE_STEP);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={RESIZE_PANEL_LABEL}
      aria-valuenow={size}
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      tabIndex={0}
      className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-ring focus-visible:bg-ring lg:block"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    />
  );
}
