import { expect, test } from 'vitest';
import { SlidingWindow } from './sliding-window';

const WINDOW_MS = 1000;
const FRAME_COUNT = 5;
const FRAME_SPACING_MS = 300;

test('an entry counts until exactly one window has passed', () => {
  const clock = { time: 0 };
  const window = new SlidingWindow({ windowMs: WINDOW_MS, now: () => clock.time });
  window.record();
  clock.time = 500;
  window.record();
  clock.time = 999;
  expect([window.count(), window.oldest()]).toEqual([2, 0]);
  clock.time = 1000;
  expect([window.count(), window.oldest()]).toEqual([1, 500]);
  clock.time = 1500;
  expect([window.count(), window.oldest()]).toEqual([0, null]);
});

test('a window at the cap keeps its newest entries and counts the same after each prune', () => {
  const clock = { time: 0 };
  const window = new SlidingWindow({ windowMs: WINDOW_MS, now: () => clock.time });
  Array.from({ length: FRAME_COUNT }).forEach((_, index) => {
    clock.time = index * FRAME_SPACING_MS;
    window.record();
  });
  clock.time = 1200;
  expect([window.count(), window.oldest()]).toEqual([4, 300]);
  clock.time = 1500;
  expect([window.count(), window.oldest()]).toEqual([3, 600]);
});
