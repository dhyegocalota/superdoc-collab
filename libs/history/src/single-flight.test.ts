import { expect, test } from 'vitest';
import { SingleFlight } from './single-flight';

test('concurrent callers share one computation', async () => {
  const singleFlight = new SingleFlight<number>();
  const results = await Promise.all(Array.from({ length: 50 }, () => singleFlight.run({ key: 'k', compute: async () => Math.random() })));
  expect(singleFlight.computations).toBe(1);
  expect(new Set(results).size).toBe(1);
});

test('a failed computation is not cached and can be retried', async () => {
  const singleFlight = new SingleFlight<number>();
  await expect(singleFlight.run({ key: 'k', compute: async () => Promise.reject(new Error('boom')) })).rejects.toThrow('boom');
  await expect(singleFlight.run({ key: 'k', compute: async () => 7 })).resolves.toBe(7);
  expect(singleFlight.computations).toBe(2);
});
