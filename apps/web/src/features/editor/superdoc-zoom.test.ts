import { expect, test } from 'vitest';
import { FIT_WIDTH_ZOOM, FULL_ZOOM_PERCENT, ZoomMode } from './superdoc-zoom';

test('zoom is fit-width with max 100 at every width', () => {
  expect(FIT_WIDTH_ZOOM).toEqual({ mode: ZoomMode.FitWidth, fitWidth: { max: FULL_ZOOM_PERCENT } });
  expect(FULL_ZOOM_PERCENT).toBe(100);
});
