import { describe, expect, test } from 'vitest';
import {
  canonicalTimeZone,
  EMAIL_INVALID_MESSAGE,
  INVALID_TIME_ZONE_MESSAGE,
  isSupportedTimeZone,
  NAME_TOO_SHORT_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  signInSchema,
  signUpSchema,
  updateUserSchema,
} from './auth';

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message;
}

describe('signInSchema', () => {
  test('lowercases and trims the email', () => {
    const parsed = signInSchema.parse({ email: '  Ana@Example.com ', password: 'superdoc-demo' });
    expect(parsed.email).toBe('ana@example.com');
  });
  test('rejects a password shorter than the minimum with a human message', () => {
    expect(firstMessage(signInSchema.safeParse({ email: 'ana@example.com', password: 'short' }))).toBe(PASSWORD_TOO_SHORT_MESSAGE);
  });
  test('rejects an invalid email with a human message', () => {
    expect(firstMessage(signInSchema.safeParse({ email: 'not-an-email', password: 'superdoc-demo' }))).toBe(EMAIL_INVALID_MESSAGE);
  });
});

describe('signUpSchema', () => {
  test('requires a name with at least two characters', () => {
    expect(firstMessage(signUpSchema.safeParse({ name: 'A', email: 'ana@example.com', password: 'superdoc-demo' }))).toBe(
      NAME_TOO_SHORT_MESSAGE,
    );
  });
});

const SIGN_UP_BASE = { name: 'Eve', email: 'eve@example.com', password: 'long-enough-password' };

test('sign-up accepts a known IANA time zone', () => {
  expect(signUpSchema.safeParse({ ...SIGN_UP_BASE, timeZone: 'America/Sao_Paulo' }).success).toBe(true);
});

test('sign-up accepts UTC, which browsers report but Intl.supportedValuesOf omits', () => {
  expect(signUpSchema.safeParse({ ...SIGN_UP_BASE, timeZone: 'UTC' }).success).toBe(true);
});

test('sign-up rejects an unknown time zone with its message', () => {
  const rejected = signUpSchema.safeParse({ ...SIGN_UP_BASE, timeZone: 'Mars/Olympus' });
  expect(rejected.error?.issues[0]?.message).toBe(INVALID_TIME_ZONE_MESSAGE);
});

test('sign-up requires a time zone', () => {
  expect(signUpSchema.safeParse(SIGN_UP_BASE).success).toBe(false);
});

test.each([
  ['the current IANA name of a renamed zone', 'Asia/Kolkata', true],
  ['the legacy name the runtime lists', 'Asia/Calcutta', true],
  ['a quarter-hour zone under its current name', 'Asia/Kathmandu', true],
  ['UTC', 'UTC', true],
  ['the Etc alias of UTC', 'Etc/UTC', true],
  ['a raw offset, which is not a zone', '+05:30', false],
  ['an unknown name', 'Mars/Olympus', false],
  ['an oversized value', 'x'.repeat(200_000), false],
])('isSupportedTimeZone accepts %s: %s', (_name, value, expected) => {
  expect(isSupportedTimeZone(value)).toBe(expected);
});

test.each([
  ['a lowercase spelling', 'america/sao_paulo', 'America/Sao_Paulo'],
  ['an uppercase spelling', 'AMERICA/SAO_PAULO', 'America/Sao_Paulo'],
  ['the canonical spelling', 'America/Sao_Paulo', 'America/Sao_Paulo'],
  ['an alias', 'US/Eastern', 'America/New_York'],
])('canonicalTimeZone resolves %s to one name', (_name, value, expected) => {
  expect(canonicalTimeZone(value)).toBe(expected);
});

test('sign-up and update-user parse a time zone to its canonical name', () => {
  expect(signUpSchema.parse({ ...SIGN_UP_BASE, timeZone: 'america/sao_paulo' }).timeZone).toBe('America/Sao_Paulo');
  expect(updateUserSchema.parse({ timeZone: 'US/Eastern' }).timeZone).toBe('America/New_York');
});
