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

function mount(targetRef: { current: HTMLElement }) {
  return renderHook(({ selectionCount }) => useRevealSelected({ targetRef, selectionCount }), {
    initialProps: { selectionCount: 0 },
  });
}

beforeEach(() => {
  scrollIntoView.mockClear();
  stubMotionPreference(false);
});
afterEach(() => vi.restoreAllMocks());

test('a pointer selection scrolls the header into view smoothly', () => {
  const hook = mount(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectionCount: 1 });
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'smooth' });
});

test('reduced motion scrolls instantly', () => {
  stubMotionPreference(true);
  const hook = mount(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectionCount: 1 });
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'auto' });
});

test('a tap on the bin already selected reveals the header again', () => {
  const hook = mount(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectionCount: 1 });
  window.dispatchEvent(new Event('pointerup'));
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectionCount: 2 });
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('a drag reveals on every bin it crosses', () => {
  const hook = mount(header());
  window.dispatchEvent(new Event('pointerdown'));
  hook.rerender({ selectionCount: 1 });
  hook.rerender({ selectionCount: 2 });
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('a keyboard selection never scrolls', () => {
  const hook = mount(header());
  window.dispatchEvent(new Event('keydown'));
  hook.rerender({ selectionCount: 1 });
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('a selection after the pointer was released never scrolls', () => {
  const hook = mount(header());
  window.dispatchEvent(new Event('pointerdown'));
  window.dispatchEvent(new Event('pointerup'));
  hook.rerender({ selectionCount: 1 });
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('mounting does not scroll', () => {
  window.dispatchEvent(new Event('pointerdown'));
  mount(header());
  expect(scrollIntoView).not.toHaveBeenCalled();
});
