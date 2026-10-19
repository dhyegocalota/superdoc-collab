import { DAY_MS, MINUTE_MS } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { TrackedChangeKind, type SeedParagraph } from '../seed-docx';
import { buildShowcaseParagraphs } from './showcase-paragraphs';

const CREATED_AT = Date.UTC(2026, 9, 19, 12, 0);
const AUTHORS = ['Ana Lima', 'Bruno Costa', 'Caio Souza', 'Dani Alves'];
const WORKING_DAYS = 5;
const MIN_BURSTS_PER_DAY = 3;
const MAX_BURSTS_PER_DAY = 4;
const IDLE_GAP_MS = 5 * MINUTE_MS;
const WITHIN_BURST_MS = 2 * MINUTE_MS;
const MIN_PARAGRAPHS = 24;
const MAX_PARAGRAPHS = 26;
const CREATION_TIMES = [CREATED_AT, Date.UTC(2026, 9, 19, 0, 0), Date.UTC(2027, 0, 1, 23, 59), Date.UTC(2026, 2, 8, 6, 30)];

function changeTimes(paragraphs: SeedParagraph[]): number[] {
  return paragraphs
    .flatMap((paragraph) => paragraph.trackedChanges.map((change) => Date.parse(change.date)))
    .sort((first, second) => first - second);
}

function burstsOf(times: number[]): number[][] {
  return times.reduce<number[][]>((bursts, time) => {
    const current = bursts.at(-1);
    if (current && time - current.at(-1)! <= WITHIN_BURST_MS) {
      current.push(time);
      return bursts;
    }
    return [...bursts, [time]];
  }, []);
}

describe('showcase paragraphs', () => {
  test('four authors across five days with gaps over five minutes', () => {
    const paragraphs = buildShowcaseParagraphs({ now: CREATED_AT });
    const changes = paragraphs.flatMap((paragraph) => paragraph.trackedChanges);
    const bursts = burstsOf(changeTimes(paragraphs));
    const days = new Set(bursts.map((burst) => Math.floor(burst[0]! / DAY_MS)));
    const burstsPerDay = [...days].map((day) => bursts.filter((burst) => Math.floor(burst[0]! / DAY_MS) === day).length);
    const gaps = bursts.slice(1).map((burst, index) => burst[0]! - bursts[index]!.at(-1)!);
    expect([...new Set(changes.map((change) => change.author))].sort()).toEqual(AUTHORS);
    expect(days.size).toBe(WORKING_DAYS);
    burstsPerDay.forEach((count) => expect(count).toBeGreaterThanOrEqual(MIN_BURSTS_PER_DAY));
    burstsPerDay.forEach((count) => expect(count).toBeLessThanOrEqual(MAX_BURSTS_PER_DAY));
    gaps.forEach((gap) => expect(gap).toBeGreaterThan(IDLE_GAP_MS));
  });

  test('has about twenty-five paragraphs with insertions and deletions', () => {
    const paragraphs = buildShowcaseParagraphs({ now: CREATED_AT });
    const kinds = new Set(paragraphs.flatMap((paragraph) => paragraph.trackedChanges.map((change) => change.kind)));
    expect(paragraphs.length).toBeGreaterThanOrEqual(MIN_PARAGRAPHS);
    expect(paragraphs.length).toBeLessThanOrEqual(MAX_PARAGRAPHS);
    expect(kinds).toEqual(new Set([TrackedChangeKind.Insert, TrackedChangeKind.Delete]));
  });

  test('writes every date as an absolute UTC ISO string', () => {
    const dates = buildShowcaseParagraphs({ now: CREATED_AT }).flatMap((paragraph) =>
      paragraph.trackedChanges.map((change) => change.date),
    );
    dates.forEach((date) => expect(date).toBe(new Date(date).toISOString()));
  });

  test.each(CREATION_TIMES)('ends the day before creation at %i, never in the future', (now) => {
    const times = changeTimes(buildShowcaseParagraphs({ now }));
    const dayBefore = Math.floor(now / DAY_MS) - 1;
    expect(Math.floor(times.at(-1)! / DAY_MS)).toBe(dayBefore);
    expect(times.at(-1)!).toBeLessThan(now);
  });

  test('keeps the gaps between changes whatever the creation time', () => {
    const gapsAt = (now: number) => changeTimes(buildShowcaseParagraphs({ now })).map((time, index, times) => time - times[index - 1]!);
    expect(gapsAt(CREATED_AT).slice(1)).toEqual(gapsAt(Date.UTC(2027, 5, 3, 17, 45)).slice(1));
  });
});
