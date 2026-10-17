import type { SuperDoc } from 'superdoc';
import { afterEach, expect, test, vi } from 'vitest';
import { followViewportZoom, FULL_ZOOM_PERCENT, initialZoomMode, NARROW_VIEWPORT_QUERY, ZoomMode } from './superdoc-zoom';

type ChangeListener = (event: MediaQueryListEvent) => void;

function viewportDouble(matches: boolean) {
  const listeners = new Set<ChangeListener>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(query);
  function change(nextMatches: boolean): void {
    listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent));
  }
  return { matchMedia, listeners, change };
}

function superdocDouble() {
  return { setZoom: vi.fn(), setZoomMode: vi.fn() };
}

afterEach(() => vi.restoreAllMocks());

test('a narrow viewport starts fitted to the width and a wide one at full size', () => {
  const { matchMedia } = viewportDouble(true);
  expect(initialZoomMode(window)).toBe(ZoomMode.FitWidth);
  expect(matchMedia).toHaveBeenCalledWith(NARROW_VIEWPORT_QUERY);
  viewportDouble(false);
  expect(initialZoomMode(window)).toBe(ZoomMode.Manual);
});

test('crossing the breakpoint switches the zoom both ways and unsubscribing stops it', () => {
  const viewport = viewportDouble(false);
  const superdoc = superdocDouble();
  const stop = followViewportZoom({ superdoc: superdoc as unknown as SuperDoc, viewport: window });
  viewport.change(true);
  expect(superdoc.setZoomMode).toHaveBeenCalledWith(ZoomMode.FitWidth);
  viewport.change(false);
  expect(superdoc.setZoom).toHaveBeenCalledWith(FULL_ZOOM_PERCENT);
  stop();
  expect(viewport.listeners.size).toBe(0);
});
