import { expectTypeOf, test } from 'vitest';
import { TimelineQueryParam, TimelineSearchParam } from './timeline';

test('every page search parameter is also a timeline query parameter', () => {
  expectTypeOf<`${TimelineSearchParam}`>().toExtend<`${TimelineQueryParam}`>();
});
