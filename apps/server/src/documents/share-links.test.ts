import { expect, test } from 'vitest';
import { deriveShareToken, hashShareToken } from './share-links';

const SECRET = 'a-secret-that-is-long-enough-for-hmac';
const HEX_DIGEST_LENGTH = 64;

test('one nonce and secret derive the same token and another nonce a different one', () => {
  const token = deriveShareToken({ secret: SECRET, nonce: 'nonce-one' });
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' })).toBe(token);
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-two' })).not.toBe(token);
});

test('the stored hash is 64 hex characters and differs from the token', () => {
  const token = deriveShareToken({ secret: SECRET, nonce: 'nonce-one' });
  const hash = hashShareToken(token);
  expect(hash).toMatch(new RegExp(`^[0-9a-f]{${HEX_DIGEST_LENGTH}}$`));
  expect(hash).not.toBe(token);
});
