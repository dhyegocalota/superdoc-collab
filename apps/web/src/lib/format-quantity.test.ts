import { expect, test } from 'vitest';
import { formatByteCount, formatCount } from './format-quantity';

const BYTE_CASES: [number, string][] = [
  [0, '0 B'],
  [1023, '1,023 B'],
  [1024, '1 KB'],
  [1536, '1.5 KB'],
  [4_400_000, '4.2 MB'],
  [9_961_472, '9.5 MB'],
  [3 * 1024 ** 3, '3 GB'],
];

test('a count groups its thousands', () => {
  expect(formatCount(56_800)).toBe('56,800');
});

test.each(BYTE_CASES)('%i bytes read %s', (byteCount, expected) => {
  expect(formatByteCount(byteCount)).toBe(expected);
});
