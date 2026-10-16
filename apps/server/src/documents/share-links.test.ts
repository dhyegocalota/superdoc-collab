import { expect, test } from 'vitest';
import { deriveShareToken, hashShareToken } from './share-links';

const SECRET = 'a-secret-that-is-long-enough-for-hmac';
const HEX_DIGEST_LENGTH = 64;

test('one nonce and secret derive the same token twice', () => {
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' })).toBe(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' }));
});

test('two nonces derive different tokens', () => {
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' })).not.toBe(deriveShareToken({ secret: SECRET, nonce: 'nonce-two' }));
});

test('another secret derives a different token', () => {
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' })).not.toBe(deriveShareToken({ secret: `${SECRET}-other`, nonce: 'nonce-one' }));
});

test('the stored hash is 64 hex characters and differs from the token', () => {
  const token = deriveShareToken({ secret: SECRET, nonce: 'nonce-one' });
  const hash = hashShareToken(token);
  expect(hash).toMatch(new RegExp(`^[0-9a-f]{${HEX_DIGEST_LENGTH}}$`));
  expect(hash).not.toBe(token);
});
