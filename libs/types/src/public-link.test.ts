import { expect, test } from 'vitest';
import { AUTHOR_COLOR_SLOT_COUNT } from './author-colors';
import { anonymousViewerOf, PublicAnimal, signedInViewerOf } from './public-link';

const VISITOR_IDS = Array.from({ length: 300 }, (_, index) => `visitor-${index}`);
const MINIMUM_DISTINCT_ANIMALS = 12;

test('an anonymous viewer is named Anonymous and its animal', () => {
  const viewer = anonymousViewerOf('visitor-1');
  expect(viewer.name).toBe(`Anonymous ${viewer.animal}`);
  expect(Object.values(PublicAnimal)).toContain(viewer.animal);
});

test('the same visitor id gives the same viewer', () => {
  expect(anonymousViewerOf('visitor-1')).toEqual(anonymousViewerOf('visitor-1'));
});

test('the colour slot is one of the author palette slots and the animals spread', () => {
  const viewers = VISITOR_IDS.map(anonymousViewerOf);
  expect(viewers.every(({ colorSlot }) => colorSlot >= 1 && colorSlot <= AUTHOR_COLOR_SLOT_COUNT)).toBe(true);
  expect(new Set(viewers.map(({ animal }) => animal)).size).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_ANIMALS);
  expect(new Set(viewers.map(({ colorSlot }) => colorSlot)).size).toBe(AUTHOR_COLOR_SLOT_COUNT);
});

test('a signed-in viewer keeps the real name and has no animal', () => {
  const viewer = signedInViewerOf({ visitorId: 'visitor-1', name: 'Bruno' });
  expect(viewer).toEqual({ id: 'visitor-1', name: 'Bruno', animal: null, colorSlot: anonymousViewerOf('visitor-1').colorSlot });
});
