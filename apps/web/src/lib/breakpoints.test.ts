import { expect, test } from 'vitest';
import { WIDE_BREAKPOINT_PX, minWidthQuery } from './breakpoints';

test('minWidthQuery builds the query for 1536', () => {
  expect(minWidthQuery(WIDE_BREAKPOINT_PX)).toBe('(min-width: 1536px)');
});
