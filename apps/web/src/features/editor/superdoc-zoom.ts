import type { SuperDoc } from 'superdoc';

export enum ZoomMode {
  Manual = 'manual',
  FitWidth = 'fit-width',
}

export const NARROW_VIEWPORT_QUERY = '(width < 64rem)';
export const FULL_ZOOM_PERCENT = 100;

export function initialZoomMode(viewport: Window): ZoomMode {
  if (viewport.matchMedia(NARROW_VIEWPORT_QUERY).matches) return ZoomMode.FitWidth;
  return ZoomMode.Manual;
}

export function followViewportZoom({ superdoc, viewport }: { superdoc: SuperDoc; viewport: Window }): () => void {
  const narrowViewport = viewport.matchMedia(NARROW_VIEWPORT_QUERY);
  function applyZoom(event: MediaQueryListEvent): void {
    if (event.matches) {
      superdoc.setZoomMode(ZoomMode.FitWidth);
      return;
    }
    superdoc.setZoom(FULL_ZOOM_PERCENT);
  }
  narrowViewport.addEventListener('change', applyZoom);
  return () => narrowViewport.removeEventListener('change', applyZoom);
}
