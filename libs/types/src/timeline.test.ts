import { expect, expectTypeOf, test } from 'vitest';
import { TimelineQueryParam, TimelineSearchParam } from './timeline';

test('every page search parameter is also a timeline query parameter', () => {
  expectTypeOf<`${TimelineSearchParam}`>().toExtend<`${TimelineQueryParam}`>();
});

test('the time zone query parameter is named timeZone', () => {
  expect(TimelineQueryParam.TimeZone).toBe('timeZone');
});
