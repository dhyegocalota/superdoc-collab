import { expect, test } from 'vitest';
import { NON_NEGATIVE_INTEGER_PATTERN, secondsRoundedUp } from './constants';

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
