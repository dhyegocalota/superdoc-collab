import { SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { KeyedSlidingWindow } from './keyed-sliding-window';

const WINDOW_MS = 10 * SECOND_MS;
const MAX_EVENTS = 3;

function windowAt(start: number): { window: KeyedSlidingWindow; advance: (milliseconds: number) => void } {
  const clock = { time: start };
  return {
    window: new KeyedSlidingWindow({ windowMs: WINDOW_MS, maxEvents: MAX_EVENTS, now: () => clock.time }),
    advance: (milliseconds) => {
      clock.time += milliseconds;
    },
  };
}

function recordTimes({ window, key, count }: { window: KeyedSlidingWindow; key: string; count: number }): void {
  Array.from({ length: count }).forEach(() => window.record(key));
}

test('a key under its budget has no wait', () => {
  const { window } = windowAt(0);
  recordTimes({ window, key: 'user-1', count: MAX_EVENTS - 1 });
  expect(window.waitMs('user-1')).toBeNull();
});

test('a key at its budget waits until its oldest event leaves the window', () => {
  const { window, advance } = windowAt(0);
  recordTimes({ window, key: 'user-1', count: MAX_EVENTS });
  advance(4 * SECOND_MS);
  expect(window.waitMs('user-1')).toBe(6 * SECOND_MS);
});

test('the wait ends when the window slides past the events', () => {
  const { window, advance } = windowAt(0);
  recordTimes({ window, key: 'user-1', count: MAX_EVENTS });
  advance(WINDOW_MS + 1);
  expect(window.waitMs('user-1')).toBeNull();
});

test('keys do not share a budget', () => {
  const { window } = windowAt(0);
  recordTimes({ window, key: 'user-1', count: MAX_EVENTS });
  expect(window.waitMs('user-2')).toBeNull();
});

test('the oldest idle key is forgotten once more keys than the cap are tracked', () => {
  const clock = { time: 0 };
  const window = new KeyedSlidingWindow({ windowMs: WINDOW_MS, maxEvents: MAX_EVENTS, maxKeys: 2, now: () => clock.time });
  recordTimes({ window, key: 'first', count: MAX_EVENTS });
  window.record('second');
  window.record('third');
  expect(window.waitMs('first')).toBeNull();
  recordTimes({ window, key: 'third', count: MAX_EVENTS });
  expect(window.waitMs('third')).not.toBeNull();
});

test('a key used recently survives the eviction of an older one', () => {
  const window = new KeyedSlidingWindow({ windowMs: WINDOW_MS, maxEvents: MAX_EVENTS, maxKeys: 2 });
  recordTimes({ window, key: 'busy', count: MAX_EVENTS });
  window.record('quiet');
  window.waitMs('busy');
  window.record('newcomer');
  expect(window.waitMs('busy')).not.toBeNull();
});
