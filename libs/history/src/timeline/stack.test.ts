import { expect, test } from 'vitest';
import { cellVolume } from './stack';

test('cellVolume of a missing cell is zero', () => {
  expect([cellVolume(undefined), cellVolume({ inserted: 2, deleted: 3, agentInserted: 0, agentDeleted: 0, authorKeys: [] })]).toEqual([
    0, 5,
  ]);
});
