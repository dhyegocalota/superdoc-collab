import { MAX_TWEENED_BANDS, STREAMGRAPH_TRANSITION_MS, TimelineBandKind } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import type { BandShape } from './streamgraph-layout';
import { useTweenedPaths } from './use-tweened-paths';

const failure = vi.hoisted(() => ({ isInterpolationBroken: false }));

vi.mock('d3-interpolate-path', async (importOriginal) => {
  const original = await importOriginal<typeof import('d3-interpolate-path')>();
  return {
    ...original,
    interpolatePath: (from: string, to: string) => {
      if (failure.isInterpolationBroken) throw new Error('malformed path');
      return original.interpolatePath(from, to);
    },
  };
});

const FRAME_MS = 16;
const HALF_TRANSITION_MS = STREAMGRAPH_TRANSITION_MS / 2;
const FLAT_PATH = 'M0,0L100,0L100,20L0,20Z';
const TALL_PATH = 'M0,10L100,10L100,40L0,40Z';
const TALLEST_PATH = 'M0,30L100,30L100,90L0,90Z';
const WIDTH = 600;
const NARROWER_WIDTH = 300;
const names = Array.from({ length: MAX_TWEENED_BANDS + 1 }, (_, index) => `Topic ${index}`);
const { bands } = timelineWith({ volumes: [names.map(() => 1)], names, kinds: names.map(() => TimelineBandKind.Topic) });

function shapeOf({ index, path }: { index: number; path: string }): BandShape {
  return { band: bands[index]!, path, saturation: 50, label: null, agentPath: null };
}

function coordinatesOf(path: string): number[] {
  return path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
}

function verticalCoordinatesOf(path: string): number[] {
  return coordinatesOf(path).filter((_, position) => position % 2 === 1);
}

function render(initial: BandShape[]) {
  return renderHook(({ shapes, isEnabled, snapKey }) => useTweenedPaths({ shapes, isEnabled, snapKey }), {
    initialProps: { shapes: initial, isEnabled: true, snapKey: WIDTH },
  });
}

function elapse(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

beforeEach(() => {
  failure.isInterpolationBroken = false;
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('a changed path tweens from the previous one and lands on the new one after the transition', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: true, snapKey: WIDTH });
  expect(result.current[0]!.path).toBe(FLAT_PATH);
  elapse(HALF_TRANSITION_MS);
  const midway = result.current[0]!.path;
  expect(midway).not.toBe(FLAT_PATH);
  expect(midway).not.toBe(TALL_PATH);
  elapse(HALF_TRANSITION_MS + FRAME_MS);
  expect(result.current[0]!.path).toBe(TALL_PATH);
});

test('the easing is ease-out: the first half covers more than half of the distance', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: true, snapKey: WIDTH });
  elapse(HALF_TRANSITION_MS);
  const [, upperEdge] = verticalCoordinatesOf(result.current[0]!.path);
  const distanceCovered = upperEdge! / 10;
  expect(distanceCovered).toBeGreaterThan(0.5);
});

test('a band that appears grows from a flat baseline', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: FLAT_PATH }), shapeOf({ index: 1, path: TALL_PATH })], isEnabled: true, snapKey: WIDTH });
  expect(new Set(verticalCoordinatesOf(result.current[1]!.path)).size).toBe(1);
  elapse(HALF_TRANSITION_MS);
  expect(new Set(verticalCoordinatesOf(result.current[1]!.path)).size).toBeGreaterThan(1);
  elapse(HALF_TRANSITION_MS + FRAME_MS);
  expect(result.current[1]!.path).toBe(TALL_PATH);
});

test('a band that disappears shrinks to its baseline and is dropped after the transition', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH }), shapeOf({ index: 1, path: TALL_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: FLAT_PATH })], isEnabled: true, snapKey: WIDTH });
  expect(result.current.map((shape) => shape.band.id)).toEqual([bands[0]!.id, bands[1]!.id]);
  elapse(HALF_TRANSITION_MS);
  expect(result.current[1]!.path).not.toBe(TALL_PATH);
  elapse(HALF_TRANSITION_MS + FRAME_MS);
  expect(result.current.map((shape) => shape.band.id)).toEqual([bands[0]!.id]);
});

test('new data mid-tween retargets from the path on screen', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: true, snapKey: WIDTH });
  elapse(HALF_TRANSITION_MS);
  const onScreen = result.current[0]!.path;
  rerender({ shapes: [shapeOf({ index: 0, path: TALLEST_PATH })], isEnabled: true, snapKey: WIDTH });
  expect(result.current[0]!.path).toBe(onScreen);
  elapse(STREAMGRAPH_TRANSITION_MS + FRAME_MS);
  expect(result.current[0]!.path).toBe(TALLEST_PATH);
});

test('a re-render with identical data starts no tween', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  const frameRequest = vi.spyOn(globalThis, 'requestAnimationFrame');
  rerender({ shapes: [shapeOf({ index: 0, path: FLAT_PATH })], isEnabled: true, snapKey: WIDTH });
  expect(frameRequest).not.toHaveBeenCalled();
  expect(result.current[0]!.path).toBe(FLAT_PATH);
});

test('reduced motion snaps to the new path', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: false, snapKey: WIDTH });
  expect(result.current[0]!.path).toBe(TALL_PATH);
});

test('more bands than the cap snap to the new paths', () => {
  const crowded = (path: string) => bands.map((_, index) => shapeOf({ index, path }));
  const { result, rerender } = render(crowded(FLAT_PATH));
  rerender({ shapes: crowded(TALL_PATH), isEnabled: true, snapKey: WIDTH });
  expect(result.current.every((shape) => shape.path === TALL_PATH)).toBe(true);
});

test('a width change snaps instead of tweening a resize', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: true, snapKey: NARROWER_WIDTH });
  expect(result.current[0]!.path).toBe(TALL_PATH);
});

test('the loop is cancelled on unmount', () => {
  const { rerender, unmount } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: true, snapKey: WIDTH });
  const frameCancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
  unmount();
  expect(frameCancel).toHaveBeenCalled();
});

test('a path the interpolation rejects snaps and warns once', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  failure.isInterpolationBroken = true;
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: TALL_PATH })], isEnabled: true, snapKey: WIDTH });
  elapse(FRAME_MS);
  expect(result.current[0]!.path).toBe(TALL_PATH);
  rerender({ shapes: [shapeOf({ index: 0, path: TALLEST_PATH })], isEnabled: true, snapKey: WIDTH });
  elapse(FRAME_MS);
  expect(result.current[0]!.path).toBe(TALLEST_PATH);
  expect(warning).toHaveBeenCalledTimes(1);
});

test('a band whose number of segments changes snaps instead of tweening a broken path', () => {
  const { result, rerender } = render([shapeOf({ index: 0, path: FLAT_PATH })]);
  rerender({ shapes: [shapeOf({ index: 0, path: `${TALL_PATH}${TALLEST_PATH}` })], isEnabled: true, snapKey: WIDTH });
  elapse(HALF_TRANSITION_MS);
  expect(result.current[0]!.path).toBe(`${TALL_PATH}${TALLEST_PATH}`);
});
