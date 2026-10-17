import { expect, test } from 'vitest';
import {
  CURSOR_GLOW_MS,
  DAY_MS,
  DOCUMENT_READY_GIVE_UP_MS,
  DOCUMENT_READY_POLL_MS,
  JUMP_FAILED_NOTICE_MS,
  NON_NEGATIVE_INTEGER_PATTERN,
  WEEK_MS,
  secondsRoundedUp,
} from './constants';

test('secondsRoundedUp rounds a partial second up', () => {
  expect([0, 1, 1000, 1001].map(secondsRoundedUp)).toEqual([0, 1, 1, 2]);
});

test('the non-negative integer pattern accepts digits only', () => {
  expect(['0', '42', '-1', '1.5', '', ' 1'].map((value) => NON_NEGATIVE_INTEGER_PATTERN.test(value))).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
  ]);
});

test('a week is seven days of milliseconds', () => {
  expect(WEEK_MS).toBe(604_800_000);
  expect(WEEK_MS).toBe(7 * DAY_MS);
});

test('the waiting page, jump glow and jump notice durations are in milliseconds', () => {
  expect([DOCUMENT_READY_POLL_MS, DOCUMENT_READY_GIVE_UP_MS, CURSOR_GLOW_MS, JUMP_FAILED_NOTICE_MS]).toEqual([2000, 300_000, 1200, 3000]);
});
