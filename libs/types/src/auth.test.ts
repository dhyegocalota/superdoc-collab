import { describe, expect, test } from 'vitest';
import {
  EMAIL_INVALID_MESSAGE,
  NAME_RESERVED_MESSAGE,
  INVALID_TIME_ZONE_MESSAGE,
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
  test.each([
    'Ana · AI',
    'Ana ·  ai',
    ' Ana · AI ',
    'Bob • AI',
    'Bob ⋅ AI',
    'Bob ∙ AI',
    'Bob ・AI',
    'Bob . AI',
    'Bob · ＡＩ',
    'Bob·AI',
    'Bob · Al',
    'Bob · A\u0399',
    'Bob · \u0410I',
    'Bob · \u0391\u0399',
    'Bob · AI\u200b',
    'Bob · A\u200bI',
    'Bob · AI\u2060',
    'Bob \u2027 AI',
    'Bob \ua78f AI',
    'Bob \u02d9 AI',
    'Bob \u2e31 AI',
    'Bob · A1',
    'Bob · A|',
    'Bob · A\u04c0',
    'Bob · A\u04cf',
    'Bob · AI\ufe0f',
    'Bob · AI\u034f',
    'Bob · AI\u3164',
    'Bob ·\u3164AI',
    'Bob · AI\u2800',
    'Bob \u1427 AI',
    'Bob \u16eb AI',
    'Bob \u2e33 AI',
    'Bob \u25cf AI',
    'Bob \u2981 AI',
    'Bob · \u13aaI',
    'Bob · \u2c80I',
    'Bob · \ua4eeI',
    'Bob · \u1d00I',
    'Bob · A\u01c0',
    'Bob · A\ua4f2',
    'Bob · A\u2c92',
    'Bob · A\u05c0',
    'Bob · A\u2d4f',
  ])('rejects the name "%s" that impersonates an AI', (name) => {
    expect(firstMessage(signUpSchema.safeParse({ name, email: 'ana@example.com', password: 'superdoc-demo' }))).toBe(NAME_RESERVED_MESSAGE);
  });
  test.each(['Li Ai', 'Tanaka Ai', 'Wang Al'])('accepts the real name "%s" that only ends in a space and two letters', (name) => {
    expect(signUpSchema.safeParse({ name, email: 'ana@example.com', password: 'superdoc-demo' }).success).toBe(true);
  });
  test('accepts a name that merely contains AI', () => {
    expect(
      signUpSchema.safeParse({ name: 'Aino Maia', email: 'ana@example.com', password: 'superdoc-demo', timeZone: 'UTC' }).success,
    ).toBe(true);
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

test('update-user rejects a name that impersonates an AI', () => {
  expect(firstMessage(updateUserSchema.safeParse({ name: 'Ana · AI' }))).toBe(NAME_RESERVED_MESSAGE);
});

test('update-user accepts a time zone alone', () => {
  expect(updateUserSchema.safeParse({ timeZone: 'UTC' }).success).toBe(true);
});
