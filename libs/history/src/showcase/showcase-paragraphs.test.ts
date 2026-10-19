import { DAY_MS, HOUR_MS, MINUTE_MS } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { TrackedChangeKind, type SeedParagraph } from '../seed-docx';
import { buildShowcaseParagraphs } from './showcase-paragraphs';

const CREATED_AT = Date.UTC(2026, 9, 19, 12, 0);
const AUTHORS = ['Ana Lima', 'Bruno Costa', 'Caio Souza', 'Dani Alves'];
const WORKING_DAYS = 5;
const SESSIONS_PER_DAY = 2;
const IDLE_GAP_MS = 5 * MINUTE_MS;
const NEW_SESSION_GAP_MS = 45 * MINUTE_MS;
const MIN_SESSION_MS = 2 * HOUR_MS;
const MAX_SESSION_MS = 3 * HOUR_MS;
const MIN_LUNCH_MS = 60 * MINUTE_MS;
const MAX_LUNCH_MS = 105 * MINUTE_MS;
const MAX_EDIT_INTERVAL_MS = 15 * MINUTE_MS;
const MIN_COVERED_HOUR_SHARE = 0.6;
const MIN_CHANGES = 150;
const MAX_CHANGES = 200;
const MIN_PARAGRAPHS = 24;
const MAX_PARAGRAPHS = 26;
const CREATION_TIMES = [CREATED_AT, Date.UTC(2026, 9, 19, 0, 0), Date.UTC(2027, 0, 1, 23, 59), Date.UTC(2026, 2, 8, 6, 30)];

function changeTimes(paragraphs: SeedParagraph[]): number[] {
  return paragraphs
    .flatMap((paragraph) => paragraph.trackedChanges.map((change) => Date.parse(change.date)))
    .sort((first, second) => first - second);
}

function sessionsOf(times: number[]): number[][] {
  return times.reduce<number[][]>((sessions, time) => {
    const current = sessions.at(-1);
    if (current && time - current.at(-1)! <= NEW_SESSION_GAP_MS) {
      current.push(time);
      return sessions;
    }
    return [...sessions, [time]];
  }, []);
}

function hourBinsOf(session: number[]): number[] {
  const first = Math.floor(session[0]! / HOUR_MS);
  const last = Math.floor(session.at(-1)! / HOUR_MS);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

describe('showcase paragraphs', () => {
  test('four authors across five days in two sessions a day with gaps over five minutes', () => {
    const paragraphs = buildShowcaseParagraphs({ now: CREATED_AT });
    const changes = paragraphs.flatMap((paragraph) => paragraph.trackedChanges);
    const times = changeTimes(paragraphs);
    const sessions = sessionsOf(times);
    const days = new Set(sessions.map((session) => Math.floor(session[0]! / DAY_MS)));
    const lunches = sessions
      .slice(1)
      .map((session, index) => session[0]! - sessions[index]!.at(-1)!)
      .filter((gap) => gap < DAY_MS / 2);
    expect([...new Set(changes.map((change) => change.author))].sort()).toEqual(AUTHORS);
    expect(days.size).toBe(WORKING_DAYS);
    expect(sessions).toHaveLength(WORKING_DAYS * SESSIONS_PER_DAY);
    sessions.forEach((session) => expect(session.at(-1)! - session[0]!).toBeGreaterThanOrEqual(MIN_SESSION_MS));
    sessions.forEach((session) => expect(session.at(-1)! - session[0]!).toBeLessThanOrEqual(MAX_SESSION_MS));
    expect(lunches).toHaveLength(WORKING_DAYS);
    lunches.forEach((gap) => expect(gap).toBeGreaterThanOrEqual(MIN_LUNCH_MS));
    lunches.forEach((gap) => expect(gap).toBeLessThanOrEqual(MAX_LUNCH_MS));
    times.slice(1).forEach((time, index) => expect(time - times[index]!).toBeGreaterThanOrEqual(IDLE_GAP_MS));
  });

  test('edits come every few minutes with a ramp, a peak and a tail', () => {
    const sessions = sessionsOf(changeTimes(buildShowcaseParagraphs({ now: CREATED_AT })));
    sessions.forEach((session) =>
      session.slice(1).forEach((time, index) => expect(time - session[index]!).toBeLessThanOrEqual(MAX_EDIT_INTERVAL_MS)),
    );
    sessions.forEach((session) => {
      const gaps = session.slice(1).map((time, index) => time - session[index]!);
      const middle = gaps[Math.floor(gaps.length / 2)]!;
      expect(middle).toBeLessThan(gaps[0]!);
      expect(middle).toBeLessThan(gaps.at(-1)!);
    });
  });

  test('at least sixty percent of the hour-wide bins inside sessions carry a change', () => {
    const times = changeTimes(buildShowcaseParagraphs({ now: CREATED_AT }));
    const edited = new Set(times.map((time) => Math.floor(time / HOUR_MS)));
    const bins = sessionsOf(times).flatMap(hourBinsOf);
    const coveredShare = bins.filter((bin) => edited.has(bin)).length / bins.length;
    expect(coveredShare).toBeGreaterThanOrEqual(MIN_COVERED_HOUR_SHARE);
  });

  test('has about twenty-five paragraphs and between 150 and 200 insertions and deletions', () => {
    const paragraphs = buildShowcaseParagraphs({ now: CREATED_AT });
    const changes = paragraphs.flatMap((paragraph) => paragraph.trackedChanges);
    expect(paragraphs.length).toBeGreaterThanOrEqual(MIN_PARAGRAPHS);
    expect(paragraphs.length).toBeLessThanOrEqual(MAX_PARAGRAPHS);
    expect(changes.length).toBeGreaterThanOrEqual(MIN_CHANGES);
    expect(changes.length).toBeLessThanOrEqual(MAX_CHANGES);
    expect(new Set(changes.map((change) => change.kind))).toEqual(new Set([TrackedChangeKind.Insert, TrackedChangeKind.Delete]));
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
