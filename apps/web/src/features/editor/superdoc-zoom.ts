import type { SuperDoc } from 'superdoc';

export enum ZoomMode {
  Manual = 'manual',
  FitWidth = 'fit-width',
}

export const NARROW_VIEWPORT_QUERY = '(width < 64rem)';
export const FULL_ZOOM_PERCENT = 100;

export function initialZoomMode(): ZoomMode {
  return ZoomMode.Manual;
}

export function followViewportZoom(_superdoc: SuperDoc): () => void {
  return () => undefined;
}
