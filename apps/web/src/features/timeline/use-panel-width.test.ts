import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import {
  COMPACT_PANEL_HEIGHT_SHARE,
  DEFAULT_PANEL_HEIGHT_SHARE,
  MIN_EDITOR_HEIGHT,
  MIN_PANEL_HEIGHT,
  PANEL_RESIZE_STEP,
  usePanelHeight,
} from './use-panel-width';

const ROOMY_AREA_HEIGHT = 1000;
const CRAMPED_AREA_HEIGHT = 400;
const ROOMY_DEFAULT_HEIGHT = 420;
const DRAGGED_HEIGHT = 600;

test('bottom height is 42 percent of the area, at least 240 and at most the area minus 240', () => {
  const roomy = renderHook(() => usePanelHeight({ areaHeight: ROOMY_AREA_HEIGHT, isCompact: false }));
  expect(DEFAULT_PANEL_HEIGHT_SHARE).toBe(0.42);
  expect(roomy.result.current.height).toBe(ROOMY_DEFAULT_HEIGHT);
  expect(roomy.result.current.maxHeight).toBe(ROOMY_AREA_HEIGHT - MIN_EDITOR_HEIGHT);
  const cramped = renderHook(() => usePanelHeight({ areaHeight: CRAMPED_AREA_HEIGHT, isCompact: false }));
  expect(cramped.result.current.height).toBe(MIN_PANEL_HEIGHT);
});

test('resizeTo and resizeBy stay within the limits and the default follows the area until the first resize', () => {
  const { result, rerender } = renderHook(({ areaHeight }) => usePanelHeight({ areaHeight, isCompact: false }), {
    initialProps: { areaHeight: ROOMY_AREA_HEIGHT },
  });
  rerender({ areaHeight: ROOMY_AREA_HEIGHT * 2 });
  expect(result.current.height).toBe(ROOMY_AREA_HEIGHT * 2 * DEFAULT_PANEL_HEIGHT_SHARE);
  act(() => result.current.resizeTo(DRAGGED_HEIGHT));
  expect(result.current.height).toBe(DRAGGED_HEIGHT);
  act(() => result.current.resizeBy(PANEL_RESIZE_STEP));
  expect(result.current.height).toBe(DRAGGED_HEIGHT + PANEL_RESIZE_STEP);
  act(() => result.current.resizeTo(0));
  expect(result.current.height).toBe(MIN_PANEL_HEIGHT);
  act(() => result.current.resizeTo(ROOMY_AREA_HEIGHT * 3));
  expect(result.current.height).toBe(ROOMY_AREA_HEIGHT * 2 - MIN_EDITOR_HEIGHT);
});

test('below sm the default height is 58 percent of the area and from sm it is 42 percent', () => {
  const compact = renderHook(() => usePanelHeight({ areaHeight: ROOMY_AREA_HEIGHT, isCompact: true }));
  expect(COMPACT_PANEL_HEIGHT_SHARE).toBe(0.58);
  expect(compact.result.current.height).toBe(ROOMY_AREA_HEIGHT * COMPACT_PANEL_HEIGHT_SHARE);
  const regular = renderHook(() => usePanelHeight({ areaHeight: ROOMY_AREA_HEIGHT, isCompact: false }));
  expect(regular.result.current.height).toBe(ROOMY_DEFAULT_HEIGHT);
});
