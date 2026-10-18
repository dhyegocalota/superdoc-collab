import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from '@/lib/use-reduced-motion';
import { useRevealSelected } from './use-reveal-selected';

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

function header(): { current: HTMLElement } {
  const element = document.createElement('div');
  element.scrollIntoView = scrollIntoView;
  return { current: element };
}

function mountWithoutSelection(targetRef: { current: HTMLElement }) {
  return renderHook(({ selectedIndex }) => useRevealSelected({ targetRef, selectedIndex }), {
    initialProps: { selectedIndex: null as number | null },
  });
}

beforeEach(() => {
  scrollIntoView.mockClear();
  stubMotionPreference(false);
});
afterEach(() => vi.restoreAllMocks());

test('a pointer selection scrolls the header into view smoothly', () => {
  const hook = mountWithoutSelection(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectedIndex: 1 });
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'smooth' });
});

test('reduced motion scrolls instantly', () => {
  stubMotionPreference(true);
  const hook = mountWithoutSelection(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectedIndex: 1 });
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'auto' });
});

test('a drag reveals on every bin it crosses', () => {
  const hook = mountWithoutSelection(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectedIndex: 1 });
  hook.rerender({ selectedIndex: 2 });
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('a keyboard selection never scrolls', () => {
  const hook = mountWithoutSelection(header());
  window.dispatchEvent(new Event('keydown'));
  hook.rerender({ selectedIndex: 1 });
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('a change after the pointer was released, such as Back, never scrolls', () => {
  const hook = mountWithoutSelection(header());
  window.dispatchEvent(new Event('pointerdown'));
  window.dispatchEvent(new Event('pointerup'));
  hook.rerender({ selectedIndex: 1 });
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('mounting with a selection and clearing it do not scroll', () => {
  const targetRef = header();
  const { rerender } = renderHook(({ selectedIndex }) => useRevealSelected({ targetRef, selectedIndex }), {
    initialProps: { selectedIndex: 2 as number | null },
  });
  window.dispatchEvent(new Event('pointerdown'));
  rerender({ selectedIndex: null });
  expect(scrollIntoView).not.toHaveBeenCalled();
});
