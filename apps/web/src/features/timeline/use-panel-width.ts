import { useState } from 'react';

export const MIN_PANEL_WIDTH = 420;
export const DEFAULT_PANEL_SHARE = 0.4;
export const PANEL_RESIZE_STEP = 24;
export const MIN_EDITOR_WIDTH = 360;

export function clampWidth(width: number): number {
  return Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(width, window.innerWidth - MIN_EDITOR_WIDTH)));
}

export function usePanelWidth(): { width: number; resizeTo: (next: number) => void; resizeBy: (delta: number) => void } {
  const [width, setWidth] = useState(() => clampWidth(window.innerWidth * DEFAULT_PANEL_SHARE));
  return {
    width,
    resizeTo: (next) => setWidth(clampWidth(next)),
    resizeBy: (delta) => setWidth((current) => clampWidth(current + delta)),
  };
}
