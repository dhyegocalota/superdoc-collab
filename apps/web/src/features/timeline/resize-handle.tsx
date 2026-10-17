import type { KeyboardEvent, PointerEvent } from 'react';
import { KeyboardKey } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON_PRESSED } from '@/lib/pointer';
import { RESIZE_PANEL_LABEL } from './timeline-copy';
import { PanelPosition } from './use-panel-position';
import { PANEL_RESIZE_STEP } from './use-panel-width';

type HandleAxis = {
  orientation: 'horizontal' | 'vertical';
  growKey: KeyboardKey;
  shrinkKey: KeyboardKey;
  className: string;
  sizeAt: (event: PointerEvent<HTMLDivElement>) => number;
};

const HANDLE_AXES: Record<PanelPosition, HandleAxis> = {
  [PanelPosition.Bottom]: {
    orientation: 'horizontal',
    growKey: KeyboardKey.ArrowUp,
    shrinkKey: KeyboardKey.ArrowDown,
    className: 'h-1 w-full cursor-row-resize',
    sizeAt: (event) => window.innerHeight - event.clientY,
  },
  [PanelPosition.Side]: {
    orientation: 'vertical',
    growKey: KeyboardKey.ArrowLeft,
    shrinkKey: KeyboardKey.ArrowRight,
    className: 'hidden w-1 cursor-col-resize lg:block',
    sizeAt: (event) => window.innerWidth - event.clientX,
  },
};

export function ResizeHandle({
  position,
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
  const axis = HANDLE_AXES[position];

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (event.buttons !== PRIMARY_BUTTON_PRESSED) return;
    resizeTo(axis.sizeAt(event));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === axis.growKey) resizeBy(PANEL_RESIZE_STEP);
    if (event.key === axis.shrinkKey) resizeBy(-PANEL_RESIZE_STEP);
  }

  return (
    <div
      role="separator"
      aria-orientation={axis.orientation}
      aria-label={RESIZE_PANEL_LABEL}
      aria-valuenow={size}
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      tabIndex={0}
      className={cn('shrink-0 bg-border hover:bg-ring focus-visible:bg-ring', axis.className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    />
  );
}
