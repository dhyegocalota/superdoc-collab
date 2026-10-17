import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { maxBandVolume } from './max-band-volume';

test('the largest band volume, or zero without bands', () => {
  expect(
    maxBandVolume(
      timelineWith({
        volumes: [
          [3, 9],
          [4, 0],
        ],
        names: ['Budget', 'Hiring'],
      }),
    ),
  ).toBe(9);
  expect(maxBandVolume(timelineWith({ volumes: [], names: [] }))).toBe(0);
});
