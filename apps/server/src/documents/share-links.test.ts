import { expect, test } from 'vitest';
import { deriveShareToken } from './share-links';

const SECRET = 'a-secret-that-is-long-enough-for-hmac';

test('one nonce and secret derive the same token and another nonce a different one', () => {
  const token = deriveShareToken({ secret: SECRET, nonce: 'nonce-one' });
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' })).toBe(token);
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-two' })).not.toBe(token);
});
