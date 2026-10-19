import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { KeyboardKey } from '@/lib/keyboard';
import { PRIMARY_BUTTON_PRESSED } from '@/lib/pointer';
import { nextIndex } from './streamgraph-navigation';
import type { BreakColumn, StreamgraphLayout } from './streamgraph-layout';
import { TOOLTIP_POINTER_OFFSET } from './timeline-tooltip';

type Hovered = { index: number; y: number; idleBreak: BreakColumn | null };
export type TooltipAnchor = { index: number; top: number; idleBreak: BreakColumn | null };

function tooltipAnchorOf({
  hovered,
  selectedIndex,
  hasFocus,
}: {
  hovered: Hovered | null;
  selectedIndex: number | null;
  hasFocus: boolean;
}): TooltipAnchor | null {
  if (hovered !== null) return { index: hovered.index, top: hovered.y + TOOLTIP_POINTER_OFFSET, idleBreak: hovered.idleBreak };
  if (!hasFocus || selectedIndex === null) return null;
  return { index: selectedIndex, top: TOOLTIP_POINTER_OFFSET, idleBreak: null };
}

export type StreamgraphInteraction = {
  hasKeyboardFocus: boolean;
  tooltipAnchor: TooltipAnchor | null;
  chartHandlers: {
    onPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
  };
  bandHandlers: {
    onKeyDown: (event: KeyboardEvent<SVGPathElement>) => void;
    onFocus: () => void;
    onBlur: () => void;
  };
};

export function useStreamgraphInteraction({
  layout,
  lastIndex,
  selectedIndex,
  isLoadingVersion,
  onSelectIndex,
  onClearSelection,
}: {
  layout: StreamgraphLayout;
  lastIndex: number;
  selectedIndex: number | null;
  isLoadingVersion: boolean;
  onSelectIndex: (index: number) => void;
  onClearSelection: () => void;
}): StreamgraphInteraction {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const isPointerFocus = useRef(false);
  const tooltipAnchor = tooltipAnchorOf({ hovered, selectedIndex, hasFocus: hasKeyboardFocus });

  function offsetOf(event: PointerEvent<SVGSVGElement>): number {
    return event.clientX - event.currentTarget.getBoundingClientRect().left;
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    isPointerFocus.current = true;
    setHasKeyboardFocus(false);
    if (isLoadingVersion) return;
    onSelectIndex(layout.binAt(offsetOf(event)));
  }

  function endPointerPress(): void {
    isPointerFocus.current = false;
  }

  function handlePointerLeave(): void {
    endPointerPress();
    setHovered(null);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    const index = layout.binAt(offsetOf(event));
    setHovered({ index, y: event.clientY - event.currentTarget.getBoundingClientRect().top, idleBreak: layout.breakAt(offsetOf(event)) });
    const isScrubbing = event.buttons === PRIMARY_BUTTON_PRESSED && !isLoadingVersion;
    const isOtherBin = index !== selectedIndex;
    if (isScrubbing && isOtherBin) onSelectIndex(index);
  }

  function handleFocus(): void {
    setHasKeyboardFocus(!isPointerFocus.current);
  }

  function handleBlur(): void {
    isPointerFocus.current = false;
    setHasKeyboardFocus(false);
  }

  function handleKeyDown(event: KeyboardEvent<SVGPathElement>): void {
    isPointerFocus.current = false;
    setHasKeyboardFocus(true);
    if (event.key === KeyboardKey.Escape) {
      event.stopPropagation();
      onClearSelection();
      return;
    }
    const index = nextIndex({ key: event.key, selectedIndex, lastIndex, breaks: layout.breaks });
    if (index === null) return;
    event.preventDefault();
    onSelectIndex(index);
  }

  return {
    hasKeyboardFocus,
    tooltipAnchor,
    chartHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endPointerPress,
      onPointerLeave: handlePointerLeave,
    },
    bandHandlers: { onKeyDown: handleKeyDown, onFocus: handleFocus, onBlur: handleBlur },
  };
}
