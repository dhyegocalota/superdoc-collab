import { describe, expect, test } from 'vitest';
import { signInSchema, signUpSchema } from './auth';

describe('signInSchema', () => {
  test('lowercases and trims the email', () => {
    const parsed = signInSchema.parse({ email: '  Ana@Example.com ', password: 'superdoc-demo' });
    expect(parsed.email).toBe('ana@example.com');
  });
  test('rejects a password shorter than the minimum', () => {
    expect(signInSchema.safeParse({ email: 'ana@example.com', password: 'short' }).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  test('requires a name with at least two characters', () => {
    expect(signUpSchema.safeParse({ name: 'A', email: 'ana@example.com', password: 'superdoc-demo' }).success).toBe(false);
  });
});
