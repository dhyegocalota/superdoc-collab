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
