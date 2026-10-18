import { expect, test } from 'vitest';
import { LARGE_BREAKPOINT_PX, WIDE_BREAKPOINT_PX, minWidthQuery } from './breakpoints';

test('minWidthQuery builds the query for 1536', () => {
  expect(minWidthQuery(WIDE_BREAKPOINT_PX)).toBe('(min-width: 1536px)');
});

test('the large breakpoint is Tailwind lg and the wide one is 2xl', () => {
  expect([LARGE_BREAKPOINT_PX, WIDE_BREAKPOINT_PX]).toEqual([1024, 1536]);
  expect(minWidthQuery(LARGE_BREAKPOINT_PX)).toBe('(min-width: 1024px)');
});
