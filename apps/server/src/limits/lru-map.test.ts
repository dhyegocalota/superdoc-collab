import { expect, test } from 'vitest';
import { LruMap } from './lru-map';

function holding(maxEntries: number): LruMap<number> {
  return new LruMap<number>({ isOverBudget: (entries) => entries.size > maxEntries });
}

test('a read refreshes recency, so the least recently read entry is evicted', () => {
  const map = holding(2);
  map.set({ key: 'a', value: 1 });
  map.set({ key: 'b', value: 2 });
  map.get('a');
  expect(map.set({ key: 'c', value: 3 })).toEqual([{ key: 'b', value: 2 }]);
  expect(map.keys()).toEqual(['a', 'c']);
});

test('setting an existing key moves it to the newest end without evicting', () => {
  const map = holding(2);
  map.set({ key: 'a', value: 1 });
  map.set({ key: 'b', value: 2 });
  expect(map.set({ key: 'a', value: 9 })).toEqual([]);
  expect([map.keys(), map.values()]).toEqual([
    ['b', 'a'],
    [2, 9],
  ]);
});

test('a peek leaves recency alone', () => {
  const map = holding(2);
  map.set({ key: 'a', value: 1 });
  map.set({ key: 'b', value: 2 });
  expect(map.peek('a')).toBe(1);
  expect(map.set({ key: 'c', value: 3 })).toEqual([{ key: 'a', value: 1 }]);
});

test('a value budget evicts oldest first and never the last entry', () => {
  const map = new LruMap<number>({
    isOverBudget: (entries) => [...entries.values()].reduce((total, value) => total + value, 0) > 10 && entries.size > 1,
  });
  map.set({ key: 'a', value: 4 });
  map.set({ key: 'b', value: 4 });
  expect(map.set({ key: 'c', value: 11 })).toEqual([
    { key: 'a', value: 4 },
    { key: 'b', value: 4 },
  ]);
  expect(map.keys()).toEqual(['c']);
});

test('a missing key reads as null and deletes as false', () => {
  const map = holding(1);
  expect([map.get('x'), map.peek('x'), map.delete('x'), map.size()]).toEqual([null, null, false, 0]);
});
