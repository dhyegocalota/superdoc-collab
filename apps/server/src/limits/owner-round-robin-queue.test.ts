import { expect, test } from 'vitest';
import { OwnerRoundRobinQueue } from './owner-round-robin-queue';

function drain(queue: OwnerRoundRobinQueue<string>): string[] {
  const item = queue.shift();
  if (item === undefined) return [];
  return [item, ...drain(queue)];
}

test('owners take turns, one item each, and an owner with more items goes to the back', () => {
  const queue = new OwnerRoundRobinQueue<string>();
  ['ana-1', 'ana-2', 'ana-3'].forEach((item) => queue.push({ owner: 'ana', item }));
  queue.push({ owner: 'bruno', item: 'bruno-1' });
  queue.push({ owner: 'carla', item: 'carla-1' });
  expect(drain(queue)).toEqual(['ana-1', 'bruno-1', 'carla-1', 'ana-2', 'ana-3']);
});

test('an owner who arrives later waits only for the owners already queued, not for their later items', () => {
  const queue = new OwnerRoundRobinQueue<string>();
  ['ana-1', 'ana-2'].forEach((item) => queue.push({ owner: 'ana', item }));
  expect(queue.shift()).toBe('ana-1');
  queue.push({ owner: 'ana', item: 'ana-3' });
  queue.push({ owner: 'bruno', item: 'bruno-1' });
  expect(drain(queue)).toEqual(['ana-2', 'bruno-1', 'ana-3']);
});

test('an empty queue shifts nothing', () => {
  expect(new OwnerRoundRobinQueue<string>().shift()).toBeUndefined();
});

test('an owner is known while an item of theirs waits and no longer after the last one is taken', () => {
  const queue = new OwnerRoundRobinQueue<string>();
  expect(queue.hasOwner('ana')).toBe(false);
  queue.push({ owner: 'ana', item: 'ana-1' });
  expect(queue.hasOwner('ana')).toBe(true);
  expect(queue.hasOwner('bruno')).toBe(false);
  queue.shift();
  expect(queue.hasOwner('ana')).toBe(false);
});

test('removing an item keeps it from ever being taken and forgets an owner left with nothing', () => {
  const queue = new OwnerRoundRobinQueue<string>();
  queue.push({ owner: 'ana', item: 'ana-1' });
  queue.push({ owner: 'bruno', item: 'bruno-1' });
  queue.remove('ana-1');
  expect(queue.hasOwner('ana')).toBe(false);
  expect(drain(queue)).toEqual(['bruno-1']);
});

test('an item without an owner is its own owner', () => {
  const queue = new OwnerRoundRobinQueue<string>();
  queue.push({ owner: null, item: 'orphan-1' });
  queue.push({ owner: 'ana', item: 'ana-1' });
  expect(queue.hasOwner(null)).toBe(true);
  expect(drain(queue)).toEqual(['orphan-1', 'ana-1']);
});
