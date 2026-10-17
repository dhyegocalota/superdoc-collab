import { expect, test } from 'vitest';
import { presentOrNull } from './text';

test('presentOrNull keeps text and turns an empty or missing value into null', () => {
  expect([presentOrNull('Ana'), presentOrNull(''), presentOrNull(undefined)]).toEqual(['Ana', null, null]);
});
