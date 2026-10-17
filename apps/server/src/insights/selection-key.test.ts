import { MINUTE_MS, type EditSelection } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { selectionKeyOf } from './selection-key';

const BIN_MS = MINUTE_MS;
const NO_SELECTION: EditSelection = { term: null, author: null, topic: null, at: null };

test('a decomposed accent and its composed form share a key', () => {
  expect(selectionKeyOf({ selection: { ...NO_SELECTION, author: 'João' }, binMs: BIN_MS })).toBe(selectionKeyOf({ selection: { ...NO_SELECTION, author: 'joão' }, binMs: BIN_MS }));
});

test('case and surrounding spaces do not change the key', () => {
  expect(selectionKeyOf({ selection: { ...NO_SELECTION, term: '  Budget ', author: 'ANA' }, binMs: BIN_MS })).toBe(selectionKeyOf({ selection: { ...NO_SELECTION, term: 'budget', author: 'ana' }, binMs: BIN_MS }));
});

test('the bin size changes the key only when a period is selected', () => {
  expect(selectionKeyOf({ selection: NO_SELECTION, binMs: BIN_MS })).toBe(selectionKeyOf({ selection: NO_SELECTION, binMs: 2 * BIN_MS }));
  const period = { ...NO_SELECTION, at: 0 };
  expect(selectionKeyOf({ selection: period, binMs: BIN_MS })).not.toBe(selectionKeyOf({ selection: period, binMs: 2 * BIN_MS }));
});

test('term, person, topic and period each give a different key', () => {
  const keys = [NO_SELECTION, { ...NO_SELECTION, term: 'a' }, { ...NO_SELECTION, author: 'a' }, { ...NO_SELECTION, topic: 'a' }, { ...NO_SELECTION, at: 0 }].map((selection) => selectionKeyOf({ selection, binMs: BIN_MS }));
  expect(new Set(keys).size).toBe(keys.length);
});
