import { UTC_TIME_ZONE } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { unsupportedTimeZoneLabel } from './settings-copy';
import { timeZoneOptions } from './zone-options';

const SUPPORTED_ZONES = Intl.supportedValuesOf('timeZone');
const UNLISTED_ALIAS = SUPPORTED_ZONES.includes('Asia/Kolkata') ? 'Asia/Calcutta' : 'Asia/Kolkata';
const JANUARY = Date.UTC(2026, 0, 15, 12, 0);
const JULY = Date.UTC(2026, 6, 15, 12, 0);

function labelOf({ now, zone }: { now: number; zone: string }): string | undefined {
  return timeZoneOptions({ now, extra: [] }).find((option) => option.value === zone)?.label;
}

test.each([
  { now: JANUARY, zone: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-03:00)' },
  { now: JANUARY, zone: 'Europe/Lisbon', label: 'Europe/Lisbon (UTC+00:00)' },
  { now: JULY, zone: 'Europe/Lisbon', label: 'Europe/Lisbon (UTC+01:00)' },
  { now: JANUARY, zone: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+09:00)' },
  { now: JANUARY, zone: UTC_TIME_ZONE, label: 'UTC (UTC+00:00)' },
])('labels $zone with its offset at the given instant', ({ now, zone, label }) => {
  expect(labelOf({ now, zone })).toBe(label);
});

test('lists every supported zone once, sorted, with UTC among them', () => {
  const values = timeZoneOptions({ now: JANUARY, extra: [] }).map((option) => option.value);
  expect(values).toEqual([...new Set(values)].sort());
  expect(values).toContain(UTC_TIME_ZONE);
  expect(values.length).toBeGreaterThan(300);
});

test('keeps a stored zone the runtime no longer knows, marked as not recognized', () => {
  const options = timeZoneOptions({ now: JANUARY, extra: ['Mars/Olympus'] });
  expect(options.find((option) => option.value === 'Mars/Olympus')?.label).toBe(unsupportedTimeZoneLabel('Mars/Olympus'));
});

test('adds an alias the runtime resolves but does not list, with its offset', () => {
  const options = timeZoneOptions({ now: JANUARY, extra: [UNLISTED_ALIAS] });
  expect(options.find((option) => option.value === UNLISTED_ALIAS)?.label).toBe(`${UNLISTED_ALIAS} (UTC+05:30)`);
});
