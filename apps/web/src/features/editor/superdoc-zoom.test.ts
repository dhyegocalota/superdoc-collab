import { expect, test } from 'vitest';
import { FITTED_PAGE_CLASS, FIT_WIDTH_ZOOM, FULL_ZOOM_PERCENT, ZoomMode } from './superdoc-zoom';

test('zoom is fit-width with max 100 at every width', () => {
  expect(FIT_WIDTH_ZOOM).toEqual({ mode: ZoomMode.FitWidth, fitWidth: { max: FULL_ZOOM_PERCENT } });
  expect(FULL_ZOOM_PERCENT).toBe(100);
});

test('the page column is centred in the editor container without clipping on narrow ones', () => {
  expect(FITTED_PAGE_CLASS.split(' ')).toContain('[&_.superdoc]:justify-center-safe');
});
