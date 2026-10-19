import { expect, test } from 'vitest';
import { PasswordResetLinkCapture, PasswordResetLinkNotCapturedError } from './password-reset-links';

test('take returns the stored token and clears the slot', () => {
  const capture = new PasswordResetLinkCapture();
  capture.store({ nonce: 'nonce-one', token: 'token-one' });
  expect(capture.take('nonce-one')).toBe('token-one');
  expect(() => capture.take('nonce-one')).toThrow(PasswordResetLinkNotCapturedError);
});

test('take on an empty slot throws the named error', () => {
  expect(() => new PasswordResetLinkCapture().take('nonce-one')).toThrow(PasswordResetLinkNotCapturedError);
});

test('slots of different requests do not mix', () => {
  const capture = new PasswordResetLinkCapture();
  capture.store({ nonce: 'nonce-one', token: 'token-one' });
  capture.store({ nonce: 'nonce-two', token: 'token-two' });
  expect(capture.take('nonce-two')).toBe('token-two');
  expect(capture.take('nonce-one')).toBe('token-one');
});
