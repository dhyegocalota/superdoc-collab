import { useEffect, useState } from 'react';

export const MIN_PANEL_WIDTH = 420;
export const DEFAULT_PANEL_SHARE = 0.4;
export const PANEL_RESIZE_STEP = 24;
export const MIN_EDITOR_WIDTH = 360;

function clampWidth({ width, viewportWidth }: { width: number; viewportWidth: number }): number {
  return Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(width, viewportWidth - MIN_EDITOR_WIDTH)));
}

export function usePanelWidth(): { width: number; maxWidth: number; resizeTo: (next: number) => void; resizeBy: (delta: number) => void } {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [requestedWidth, setRequestedWidth] = useState(window.innerWidth * DEFAULT_PANEL_SHARE);
  const width = clampWidth({ width: requestedWidth, viewportWidth });

  useEffect(() => {
    function handleResize(): void {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    width,
    maxWidth: viewportWidth - MIN_EDITOR_WIDTH,
    resizeTo: (next) => setRequestedWidth(clampWidth({ width: next, viewportWidth })),
    resizeBy: (delta) => setRequestedWidth(clampWidth({ width: width + delta, viewportWidth })),
  };
}

export const MIN_PANEL_HEIGHT = 240;
export const DEFAULT_PANEL_HEIGHT_SHARE = 0.42;
export const MIN_EDITOR_HEIGHT = 240;

function clampHeight({ height, areaHeight }: { height: number; areaHeight: number }): number {
  return Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(height, areaHeight - MIN_EDITOR_HEIGHT)));
}

export function usePanelHeight({ areaHeight }: { areaHeight: number }): {
  height: number;
  maxHeight: number;
  resizeTo: (next: number) => void;
  resizeBy: (delta: number) => void;
} {
  const [requestedHeight, setRequestedHeight] = useState<number | null>(null);
  const wantedHeight = requestedHeight === null ? areaHeight * DEFAULT_PANEL_HEIGHT_SHARE : requestedHeight;
  const height = clampHeight({ height: wantedHeight, areaHeight });

  return {
    height,
    maxHeight: areaHeight - MIN_EDITOR_HEIGHT,
    resizeTo: (next) => setRequestedHeight(next),
    resizeBy: (delta) => setRequestedHeight(height + delta),
  };
}

export function useAreaHeight(): { ref: (element: HTMLElement | null) => void; height: number } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const area = element ? element.parentElement : null;
    if (!area) return;
    const observer = new ResizeObserver(() => setHeight(Math.round(area.getBoundingClientRect().height)));
    observer.observe(area);
    return () => observer.disconnect();
  }, [element]);

  return { ref: setElement, height };
}
