import { expect, test } from 'vitest';
import { countWords } from './words';

test('counts whitespace separated words', () => {
  expect(countWords('  plan the  budget ')).toBe(3);
  expect(countWords('')).toBe(0);
  expect(countWords('   ')).toBe(0);
});
