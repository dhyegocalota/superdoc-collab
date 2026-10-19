import { CARET_ON_OPEN_TIMEOUT_MS } from '@superdoc-collab/types';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useCaretOnOpen } from './use-caret-on-open';

const FRAGMENT_CLASS = 'superdoc-fragment';
const PAGE_CLASS = 'superdoc-page';
const POINTER_SEQUENCE = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];

let pendingFrames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let container: HTMLElement;

function flushFrames(): void {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  callbacks.forEach((callback) => callback(0));
}

function addFragment(): HTMLElement {
  const page = document.createElement('div');
  const fragment = document.createElement('div');
  page.className = PAGE_CLASS;
  fragment.className = FRAGMENT_CLASS;
  page.append(fragment);
  container.append(page);
  return fragment;
}

function recordEvents(target: HTMLElement): string[] {
  const received: string[] = [];
  POINTER_SEQUENCE.forEach((type) => target.addEventListener(type, () => received.push(type)));
  return received;
}

function renderCaretOnOpen(isEnabled: boolean) {
  return renderHook(({ isEnabled }) => useCaretOnOpen({ containerRef: { current: container }, isEnabled }), {
    initialProps: { isEnabled },
  });
}

beforeEach(() => {
  pendingFrames = new Map();
  nextFrameId = 0;
  container = document.createElement('div');
  document.body.append(container);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrameId += 1;
    pendingFrames.set(nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id));
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  container.remove();
  document.body.replaceChildren();
});

test('presses the pointer sequence on the element under the first fragment once it exists', () => {
  const fragment = addFragment();
  const received = recordEvents(fragment);
  document.elementFromPoint = vi.fn(() => fragment);
  renderCaretOnOpen(true);
  flushFrames();
  expect(received).toEqual(POINTER_SEQUENCE);
});

test('waits for the first fragment before pressing', () => {
  container.innerHTML = `<div class="${PAGE_CLASS}"></div>`;
  renderCaretOnOpen(true);
  flushFrames();
  flushFrames();
  const fragment = addFragment();
  const received = recordEvents(fragment);
  document.elementFromPoint = vi.fn(() => fragment);
  flushFrames();
  expect(received).toEqual(POINTER_SEQUENCE);
});

test('presses once per instance across re-renders', () => {
  const fragment = addFragment();
  const received = recordEvents(fragment);
  document.elementFromPoint = vi.fn(() => fragment);
  const { rerender } = renderCaretOnOpen(true);
  flushFrames();
  rerender({ isEnabled: true });
  flushFrames();
  expect(received.filter((type) => type === 'click')).toHaveLength(1);
});

test('never presses while disabled, as for a reader or before collaboration is ready', () => {
  const fragment = addFragment();
  const received = recordEvents(fragment);
  document.elementFromPoint = vi.fn(() => fragment);
  renderCaretOnOpen(false);
  flushFrames();
  expect(received).toEqual([]);
  expect(pendingFrames.size).toBe(0);
});

test('gives up silently when no fragment is painted within the timeout', () => {
  renderCaretOnOpen(true);
  vi.spyOn(performance, 'now').mockReturnValue(CARET_ON_OPEN_TIMEOUT_MS + 1);
  flushFrames();
  expect(pendingFrames.size).toBe(0);
});

test('leaves focus alone when it already sits outside the editor', () => {
  const fragment = addFragment();
  const received = recordEvents(fragment);
  document.elementFromPoint = vi.fn(() => fragment);
  const titleInput = document.createElement('input');
  document.body.append(titleInput);
  titleInput.focus();
  renderCaretOnOpen(true);
  flushFrames();
  expect(received).toEqual([]);
});

test('stops looping when unmounted', () => {
  const { unmount } = renderCaretOnOpen(true);
  unmount();
  expect(pendingFrames.size).toBe(0);
});
