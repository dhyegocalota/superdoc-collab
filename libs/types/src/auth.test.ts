import { describe, expect, test } from 'vitest';
import {
  EMAIL_INVALID_MESSAGE,
  INVALID_TIME_ZONE_MESSAGE,
  NAME_TOO_SHORT_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  signInSchema,
  signUpSchema,
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
