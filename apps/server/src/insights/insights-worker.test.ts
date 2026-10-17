import { MIN_RETRY_AFTER_MS, MINUTE_MS } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { InsightsWorker, JobOutcome, LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS, LLM_WINDOW_MS } from './insights-worker';

function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test('a job over the concurrency cap is rejected while the cap is full and runs once a slot frees', async () => {
  const worker = new InsightsWorker();
  const gates = Array.from({ length: LLM_MAX_CONCURRENT_JOBS }, gate);
  const outcomes = gates.map((held, index) => worker.run({ key: `held-${index}`, job: () => held.promise }));
  expect(outcomes).toEqual(gates.map(() => JobOutcome.Started));
  expect(worker.run({ key: 'third', job: async () => undefined })).toBe(JobOutcome.Busy);
  expect(worker.run({ key: 'held-0', job: async () => undefined })).toBe(JobOutcome.AlreadyRunning);
  gates.forEach((held) => held.open());
  await worker.idle();
  expect(worker.run({ key: 'third', job: async () => undefined })).toBe(JobOutcome.Started);
  await worker.idle();
});

test('the model call after the hourly cap is refused and the window rolls over', () => {
  let now = 0;
  const worker = new InsightsWorker({ now: () => now });
  const consumed = Array.from({ length: LLM_MAX_CALLS_PER_HOUR }, () => worker.consumeCall());
  expect(consumed.every(Boolean)).toBe(true);
  expect(worker.consumeCall()).toBe(false);
  now += LLM_WINDOW_MS - MINUTE_MS;
  expect(worker.consumeCall()).toBe(false);
  now += MINUTE_MS + 1;
  expect(worker.consumeCall()).toBe(true);
});

test('jobs that never reach the model do not consume the hourly budget', async () => {
  const worker = new InsightsWorker();
  await Array.from({ length: LLM_MAX_CALLS_PER_HOUR * 2 }).reduce<Promise<void>>(async (previous, _, index) => {
    await previous;
    expect(worker.run({ key: `idle-${index}`, job: async () => undefined })).toBe(JobOutcome.Started);
    await worker.idle();
  }, Promise.resolve());
  expect(worker.consumeCall()).toBe(true);
});

test('the worker honours the configured limits', async () => {
  const worker = new InsightsWorker({ maxConcurrentJobs: 1, maxCallsPerHour: 2 });
  const held = gate();
  expect(worker.run({ key: 'first', job: () => held.promise })).toBe(JobOutcome.Started);
  expect(worker.run({ key: 'second', job: async () => undefined })).toBe(JobOutcome.Busy);
  held.open();
  await worker.idle();
  expect([worker.consumeCall(), worker.consumeCall(), worker.consumeCall()]).toEqual([true, true, false]);
});

test('checking the call budget never spends it', () => {
  const worker = new InsightsWorker({ maxCallsPerHour: 1 });
  expect(worker.hasCallBudget()).toBe(true);
  expect(worker.hasCallBudget()).toBe(true);
  expect(worker.consumeCall()).toBe(true);
  expect(worker.hasCallBudget()).toBe(false);
});

test('the wait for a call slot runs until the oldest call leaves the window and is never below the minimum', () => {
  const clock = { time: 0 };
  const worker = new InsightsWorker({ now: () => clock.time, maxCallsPerHour: 1 });
  expect(worker.retryAfterMs()).toBe(MIN_RETRY_AFTER_MS);
  worker.consumeCall();
  clock.time = 10 * MINUTE_MS;
  expect(worker.retryAfterMs()).toBe(LLM_WINDOW_MS - 10 * MINUTE_MS);
  clock.time = LLM_WINDOW_MS - 1;
  expect(worker.retryAfterMs()).toBe(MIN_RETRY_AFTER_MS);
});
