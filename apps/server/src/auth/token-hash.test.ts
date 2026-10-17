import { expect, test } from 'vitest';
import { hashToken } from './token-hash';

const HEX_DIGEST_LENGTH = 64;

test('a token hashes to 64 hex characters that differ from it', () => {
  const hash = hashToken('nonce-one');
  expect(hash).toMatch(new RegExp(`^[0-9a-f]{${HEX_DIGEST_LENGTH}}$`));
  expect(hash).not.toBe('nonce-one');
});

test('hashing is deterministic', () => {
  expect(hashToken('a')).toBe(hashToken('a'));
});
