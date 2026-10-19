import type { CSSProperties } from 'react';
import { PanelPosition } from './use-panel-position';
import { MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH, useAreaHeight, useIsCompact, usePanelHeight, usePanelWidth } from './use-panel-width';

type PanelResize = {
  size: number;
  minSize: number;
  maxSize: number;
  resizeTo: (next: number) => void;
  resizeBy: (delta: number) => void;
};

type PanelFrame = {
  areaRef: (element: HTMLElement | null) => void;
  resize: PanelResize;
  style: CSSProperties | undefined;
};

export function usePanelFrame({ position, isOpen }: { position: PanelPosition; isOpen: boolean }): PanelFrame {
  const { ref: areaRef, height: areaHeight } = useAreaHeight();
  const sideSize = usePanelWidth();
  const isCompact = useIsCompact();
  const bottomSize = usePanelHeight({ areaHeight, isCompact });
  const bottomFrame: PanelFrame = {
    areaRef,
    resize: {
      size: bottomSize.height,
      minSize: MIN_PANEL_HEIGHT,
      maxSize: bottomSize.maxHeight,
      resizeTo: bottomSize.resizeTo,
      resizeBy: bottomSize.resizeBy,
    },
    style: isOpen ? { height: `${bottomSize.height}px` } : undefined,
  };
  const sideFrame: PanelFrame = {
    areaRef,
    resize: {
      size: sideSize.width,
      minSize: MIN_PANEL_WIDTH,
      maxSize: sideSize.maxWidth,
      resizeTo: sideSize.resizeTo,
      resizeBy: sideSize.resizeBy,
    },
    style: { '--panel-width': `${sideSize.width}px` } as CSSProperties,
  };
  return position === PanelPosition.Bottom ? bottomFrame : sideFrame;
}
