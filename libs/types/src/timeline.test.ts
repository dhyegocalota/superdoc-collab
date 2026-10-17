import { expect, expectTypeOf, test } from 'vitest';
import {
  SUMMARIZE_BUSY_MESSAGE,
  SUMMARIZE_COOLDOWN_MS,
  SummarizeStep,
  TimelineQueryParam,
  TimelineSearchParam,
  type SelectionSummaryView,
  type TimelineBin,
} from './timeline';

test('every page search parameter is also a timeline query parameter', () => {
  expectTypeOf<`${TimelineSearchParam}`>().toExtend<`${TimelineQueryParam}`>();
});

test('the time zone query parameter is named timeZone', () => {
  expect(TimelineQueryParam.TimeZone).toBe('timeZone');
});

test('a timeline bin carries its own end', () => {
  expectTypeOf<TimelineBin['end']>().toBeNumber();
});

test('SummarizeStep lists idle, grouping and summarizing', () => {
  expect(Object.values(SummarizeStep)).toEqual(['idle', 'grouping', 'summarizing']);
});

test('a selection summary view carries the summarize step', () => {
  expectTypeOf<SelectionSummaryView['step']>().toEqualTypeOf<SummarizeStep>();
});

test('the summarize cooldown is thirty seconds and the busy message is one sentence', () => {
  expect(SUMMARIZE_COOLDOWN_MS).toBe(30_000);
  expect(SUMMARIZE_BUSY_MESSAGE).toMatch(/^[^.]+\.(\s[^.]+\.)?$/);
});
