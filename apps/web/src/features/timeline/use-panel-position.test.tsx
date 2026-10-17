import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LARGE_BREAKPOINT_PX, WIDE_BREAKPOINT_PX } from '@/lib/breakpoints';
import { PANEL_POSITION_STORAGE_KEY, PanelPosition, usePanelPosition } from './use-panel-position';

const NARROW_VIEWPORT_PX = 800;
const LARGE_VIEWPORT_PX = 1280;
const UNKNOWN_VALUE = 'floating';
const MIN_WIDTH_PATTERN = /min-width: (\d+)px/;

type MediaListener = () => void;

let viewportWidth = LARGE_VIEWPORT_PX;
let mediaListeners: MediaListener[] = [];

function stubMatchMedia(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return viewportWidth >= Number(MIN_WIDTH_PATTERN.exec(query)![1]);
    },
    media: query,
    addEventListener: (_type: string, listener: MediaListener) => mediaListeners.push(listener),
    removeEventListener: (_type: string, listener: MediaListener) => {
      mediaListeners = mediaListeners.filter((registered) => registered !== listener);
    },
  }));
}

function resizeViewport(width: number): void {
  viewportWidth = width;
  act(() => mediaListeners.forEach((listener) => listener()));
}

beforeEach(() => {
  viewportWidth = LARGE_VIEWPORT_PX;
  mediaListeners = [];
  stubMatchMedia();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('below 1024 px the position is Bottom and the toggle is hidden even when Side is stored', () => {
  viewportWidth = NARROW_VIEWPORT_PX;
  localStorage.setItem(PANEL_POSITION_STORAGE_KEY, PanelPosition.Side);
  const { result } = renderHook(usePanelPosition);
  expect(NARROW_VIEWPORT_PX).toBeLessThan(LARGE_BREAKPOINT_PX);
  expect(result.current.position).toBe(PanelPosition.Bottom);
  expect(result.current.canChoose).toBe(false);
});

test('at 1536 px with nothing stored the position is Side and follows matchMedia', () => {
  viewportWidth = WIDE_BREAKPOINT_PX;
  const { result } = renderHook(usePanelPosition);
  expect(result.current.position).toBe(PanelPosition.Side);
  expect(result.current.canChoose).toBe(true);
  resizeViewport(LARGE_VIEWPORT_PX);
  expect(result.current.position).toBe(PanelPosition.Bottom);
  expect(result.current.canChoose).toBe(true);
  resizeViewport(WIDE_BREAKPOINT_PX);
  expect(result.current.position).toBe(PanelPosition.Side);
});

test('a stored value that is not a PanelPosition is removed and treated as absent', () => {
  localStorage.setItem(PANEL_POSITION_STORAGE_KEY, UNKNOWN_VALUE);
  const { result } = renderHook(usePanelPosition);
  expect(result.current.position).toBe(PanelPosition.Bottom);
  expect(localStorage.getItem(PANEL_POSITION_STORAGE_KEY)).toBeNull();
});

test('from 1024 px a stored position wins over the width', () => {
  viewportWidth = WIDE_BREAKPOINT_PX;
  localStorage.setItem(PANEL_POSITION_STORAGE_KEY, PanelPosition.Bottom);
  const { result } = renderHook(usePanelPosition);
  expect(result.current.position).toBe(PanelPosition.Bottom);
  resizeViewport(LARGE_VIEWPORT_PX);
  expect(result.current.position).toBe(PanelPosition.Bottom);
});

test('choosePosition stores the choice at once and a second hook instance follows', () => {
  const { result } = renderHook(usePanelPosition);
  const { result: other } = renderHook(usePanelPosition);
  act(() => result.current.choosePosition(PanelPosition.Side));
  expect(localStorage.getItem(PANEL_POSITION_STORAGE_KEY)).toBe(PanelPosition.Side);
  expect(result.current.position).toBe(PanelPosition.Side);
  expect(other.current.position).toBe(PanelPosition.Side);
});

test('blocked storage still works for the session', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const { result } = renderHook(usePanelPosition);
  expect(result.current.position).toBe(PanelPosition.Bottom);
  act(() => result.current.choosePosition(PanelPosition.Side));
  expect(result.current.position).toBe(PanelPosition.Side);
});
