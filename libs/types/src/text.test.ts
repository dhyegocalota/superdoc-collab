import { expect, test } from 'vitest';
import { isBlank, presentOrNull } from './text';

test('presentOrNull keeps text and turns an empty or missing value into null', () => {
  expect([presentOrNull('Ana'), presentOrNull(''), presentOrNull(undefined)]).toEqual(['Ana', null, null]);
});

test('presentOrNull reads a missing search parameter as null', () => {
  expect(presentOrNull(new URLSearchParams().get('term'))).toBeNull();
});

test('isBlank is true for empty and whitespace-only text and false for anything else', () => {
  expect(['', '   ', ' \n\t', 'Ana', ' Ana '].map(isBlank)).toEqual([true, true, true, false, false]);
});
