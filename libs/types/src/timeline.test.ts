import { expect, expectTypeOf, test } from 'vitest';
import { TimelineQueryParam, TimelineSearchParam, type TimelineBin } from './timeline';

test('every page search parameter is also a timeline query parameter', () => {
  expectTypeOf<`${TimelineSearchParam}`>().toExtend<`${TimelineQueryParam}`>();
});

test('the time zone query parameter is named timeZone', () => {
  expect(TimelineQueryParam.TimeZone).toBe('timeZone');
});

test('a timeline bin carries its own end', () => {
  expectTypeOf<TimelineBin['end']>().toBeNumber();
});
