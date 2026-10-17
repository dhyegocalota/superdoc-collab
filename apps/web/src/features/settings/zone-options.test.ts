import { UTC_TIME_ZONE } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { unsupportedTimeZoneLabel } from './settings-copy';
import { timeZoneOptions } from './zone-options';

const JANUARY = Date.UTC(2026, 0, 15, 12, 0);
const JULY = Date.UTC(2026, 6, 15, 12, 0);

function labelOf({ now, zone }: { now: number; zone: string }): string | undefined {
  return timeZoneOptions({ now, current: UTC_TIME_ZONE }).find((option) => option.value === zone)?.label;
}

test.each([
  { now: JANUARY, zone: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-03:00)' },
  { now: JANUARY, zone: 'Europe/Lisbon', label: 'Europe/Lisbon (UTC+00:00)' },
  { now: JULY, zone: 'Europe/Lisbon', label: 'Europe/Lisbon (UTC+01:00)' },
  { now: JANUARY, zone: 'Asia/Kathmandu', label: 'Asia/Kathmandu (UTC+05:45)' },
  { now: JANUARY, zone: UTC_TIME_ZONE, label: 'UTC (UTC+00:00)' },
])('labels $zone with its offset at the given instant', ({ now, zone, label }) => {
  expect(labelOf({ now, zone })).toBe(label);
});

test('lists every supported zone once, sorted, with UTC among them', () => {
  const values = timeZoneOptions({ now: JANUARY, current: UTC_TIME_ZONE }).map((option) => option.value);
  expect(values).toEqual([...new Set(values)].sort());
  expect(values).toContain(UTC_TIME_ZONE);
  expect(values.length).toBeGreaterThan(300);
});

test('keeps a stored zone the runtime no longer knows, marked as not recognized', () => {
  const options = timeZoneOptions({ now: JANUARY, current: 'Mars/Olympus' });
  expect(options.find((option) => option.value === 'Mars/Olympus')?.label).toBe(unsupportedTimeZoneLabel('Mars/Olympus'));
});
