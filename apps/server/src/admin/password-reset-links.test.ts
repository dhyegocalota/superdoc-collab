import { expect, test } from 'vitest';
import { PasswordResetLinkCapture, PasswordResetLinkNotCapturedError } from './password-reset-links';

test('take returns the stored token and clears the slot', () => {
  const capture = new PasswordResetLinkCapture();
  capture.store({ userId: 'user-one', token: 'token-one' });
  expect(capture.take('user-one')).toBe('token-one');
  expect(() => capture.take('user-one')).toThrow(PasswordResetLinkNotCapturedError);
});

test('take on an empty slot throws the named error', () => {
  expect(() => new PasswordResetLinkCapture().take('user-one')).toThrow(PasswordResetLinkNotCapturedError);
});

test('slots of different users do not mix', () => {
  const capture = new PasswordResetLinkCapture();
  capture.store({ userId: 'user-one', token: 'token-one' });
  capture.store({ userId: 'user-two', token: 'token-two' });
  expect(capture.take('user-two')).toBe('token-two');
  expect(capture.take('user-one')).toBe('token-one');
});
