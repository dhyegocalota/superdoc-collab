import type { SuperDocZoomConfig } from 'superdoc';

export enum ZoomMode {
  FitWidth = 'fit-width',
}

const FULL_ZOOM_PERCENT = 100;
export const FITTED_PAGE_CLASS = '[&_.superdoc]:justify-center-safe [&_.superdoc>*]:min-w-0 [&_.presentation-editor]:items-center-safe!';
export const FIT_WIDTH_ZOOM: SuperDocZoomConfig = { mode: ZoomMode.FitWidth, fitWidth: { max: FULL_ZOOM_PERCENT } };
