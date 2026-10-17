import { describe, expect, test } from 'vitest';
import {
  EMAIL_INVALID_MESSAGE,
  NAME_RESERVED_MESSAGE,
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
  test.each(['Ana · AI', 'Ana ·  ai', ' Ana · AI ', 'Bob • AI', 'Bob ⋅ AI', 'Bob ∙ AI', 'Bob ・AI', 'Bob . AI', 'Bob · ＡＩ', 'Bob·AI', 'Bob · Al'])(
    'rejects the name "%s" that impersonates an AI',
    (name) => {
      expect(firstMessage(signUpSchema.safeParse({ name, email: 'ana@example.com', password: 'superdoc-demo' }))).toBe(
        NAME_RESERVED_MESSAGE,
      );
    },
  );
  test('accepts a name that merely contains AI', () => {
    expect(signUpSchema.safeParse({ name: 'Aino Maia', email: 'ana@example.com', password: 'superdoc-demo' }).success).toBe(true);
  });
});
