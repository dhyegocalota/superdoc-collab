import { PublicAnimal } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { ANIMAL_ICONS } from './animal-icons';

test('every animal has its own icon', () => {
  const animals = Object.values(PublicAnimal);
  expect(Object.keys(ANIMAL_ICONS)).toHaveLength(animals.length);
  expect(new Set(Object.values(ANIMAL_ICONS)).size).toBe(animals.length);
});
