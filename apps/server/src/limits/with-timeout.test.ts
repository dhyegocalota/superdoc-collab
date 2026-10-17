import { afterEach, expect, test, vi } from 'vitest';
import { ImportTimeoutError } from '../history/projection-messages';
import { withTimeout } from './with-timeout';

const DEADLINE_MS = 1000;
const HANGING = new Promise<string>(() => undefined);

afterEach(() => {
  vi.useRealTimers();
});

test('work that settles first wins and leaves no timer behind', async () => {
  vi.useFakeTimers();
  await expect(withTimeout({ work: Promise.resolve('done'), milliseconds: DEADLINE_MS, onTimeout: () => 'late' })).resolves.toBe('done');
  expect(vi.getTimerCount()).toBe(0);
});

test('a failing work rejects with its own error', async () => {
  await expect(
    withTimeout({ work: Promise.reject(new Error('boom')), milliseconds: DEADLINE_MS, onTimeout: () => 'late' }),
  ).rejects.toThrow('boom');
});

test('hanging work answers what onTimeout returns', async () => {
  vi.useFakeTimers();
  const result = withTimeout({ work: HANGING, milliseconds: DEADLINE_MS, onTimeout: () => 'late' });
  await vi.advanceTimersByTimeAsync(DEADLINE_MS);
  await expect(result).resolves.toBe('late');
});

test('hanging work rejects with the error onTimeout throws', async () => {
  vi.useFakeTimers();
  const result = withTimeout({
    work: HANGING,
    milliseconds: DEADLINE_MS,
    onTimeout: () => {
      throw new ImportTimeoutError(DEADLINE_MS);
    },
  });
  const settled = expect(result).rejects.toThrow(`The import took longer than ${DEADLINE_MS} ms.`);
  await vi.advanceTimersByTimeAsync(DEADLINE_MS);
  await settled;
});
