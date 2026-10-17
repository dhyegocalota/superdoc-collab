import { SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { KeyedCooldown } from './keyed-cooldown';

const DURATION_MS = 30 * SECOND_MS;

function clockAt(start: number): { now: () => number; advance: (milliseconds: number) => void } {
  const clock = { time: start };
  return {
    now: () => clock.time,
    advance: (milliseconds) => {
      clock.time += milliseconds;
    },
  };
}

test('a document never started has no time left', () => {
  const clock = clockAt(0);
  expect(new KeyedCooldown({ durationMs: DURATION_MS, now: clock.now }).remainingMs('d1')).toBe(0);
});

test('a started document counts down and is pruned when the time is up', () => {
  const clock = clockAt(0);
  const cooldown = new KeyedCooldown({ durationMs: DURATION_MS, now: clock.now });
  cooldown.start('d1');
  clock.advance(10 * SECOND_MS);
  expect(cooldown.remainingMs('d1')).toBe(20 * SECOND_MS);
  expect(cooldown.remainingMs('d2')).toBe(0);
  clock.advance(20 * SECOND_MS);
  expect(cooldown.remainingMs('d1')).toBe(0);
  expect(cooldown.size()).toBe(0);
});

test('forgetting a document drops only its entry', () => {
  const clock = clockAt(0);
  const cooldown = new KeyedCooldown({ durationMs: DURATION_MS, now: clock.now });
  cooldown.start('d1');
  cooldown.start('d2');
  cooldown.forget('d1');
  expect(cooldown.remainingMs('d1')).toBe(0);
  expect(cooldown.size()).toBe(1);
});

test('keys lists every key that was started and not forgotten', () => {
  const clock = clockAt(0);
  const cooldown = new KeyedCooldown({ durationMs: DURATION_MS, now: clock.now });
  ['a/1', 'a/2', 'b/1'].forEach((key) => cooldown.start(key));
  cooldown.forget('a/2');
  expect(cooldown.keys()).toEqual(['a/1', 'b/1']);
});
