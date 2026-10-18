import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from '@/lib/use-reduced-motion';
import { useRevealSelected } from './use-reveal-selected';

const SCROLLER_TOP = 0;
const SCROLLER_BOTTOM = 300;
const VISIBLE_RECT = { top: 200, bottom: 244 } as DOMRect;
const HIDDEN_RECT = { top: 400, bottom: 444 } as DOMRect;
const SCROLLER_RECT = { top: SCROLLER_TOP, bottom: SCROLLER_BOTTOM } as DOMRect;

const scrollIntoView = vi.fn();

function stubMotionPreference(prefersReducedMotion: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === REDUCED_MOTION_QUERY && prefersReducedMotion,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function headerAt(rect: DOMRect): { current: HTMLElement } {
  const scroller = document.createElement('div');
  const header = document.createElement('div');
  scroller.append(header);
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(SCROLLER_RECT);
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect);
  header.scrollIntoView = scrollIntoView;
  return { current: header };
}

function selectBin({ targetRef, index }: { targetRef: { current: HTMLElement }; index: number }) {
  const hook = renderHook(({ selectedIndex }) => useRevealSelected({ targetRef, selectedIndex }), {
    initialProps: { selectedIndex: null as number | null },
  });
  hook.rerender({ selectedIndex: index });
}

beforeEach(() => {
  scrollIntoView.mockClear();
  stubMotionPreference(false);
});
afterEach(() => vi.restoreAllMocks());

test('a pointer selection scrolls the header into view smoothly', () => {
  const targetRef = headerAt(HIDDEN_RECT);
  window.dispatchEvent(new Event('pointerdown'));
  selectBin({ targetRef, index: 1 });
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'smooth' });
});

test('reduced motion scrolls instantly', () => {
  stubMotionPreference(true);
  const targetRef = headerAt(HIDDEN_RECT);
  window.dispatchEvent(new Event('pointerdown'));
  selectBin({ targetRef, index: 1 });
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'auto' });
});

test('a keyboard selection with the header in view does not scroll', () => {
  const targetRef = headerAt(VISIBLE_RECT);
  window.dispatchEvent(new Event('keydown'));
  selectBin({ targetRef, index: 1 });
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('a keyboard selection with the header out of view scrolls', () => {
  const targetRef = headerAt(HIDDEN_RECT);
  window.dispatchEvent(new Event('keydown'));
  selectBin({ targetRef, index: 1 });
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});

test('mounting with a selection and clearing it do not scroll', () => {
  const targetRef = headerAt(HIDDEN_RECT);
  const { rerender } = renderHook(({ selectedIndex }) => useRevealSelected({ targetRef, selectedIndex }), {
    initialProps: { selectedIndex: 2 as number | null },
  });
  rerender({ selectedIndex: null });
  expect(scrollIntoView).not.toHaveBeenCalled();
});
