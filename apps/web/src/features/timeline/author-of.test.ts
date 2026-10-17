import { expect, test } from 'vitest';
import { authorNames } from './author-of';

const AUTHORS = { ana: { id: '1', name: 'Ana' }, bruno: { id: '2', name: 'Bruno' } };

test('author names follow the keys and join with a comma', () => {
  expect(authorNames({ authors: AUTHORS, authorKeys: ['bruno', 'ana'] })).toBe('Bruno, Ana');
});

test('an unknown author key throws instead of printing nothing', () => {
  expect(() => authorNames({ authors: AUTHORS, authorKeys: ['carla'] })).toThrow();
});
