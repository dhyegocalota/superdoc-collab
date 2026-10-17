import { MIN_RETRY_AFTER_MS, MINUTE_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS } from '../config/environment';
import { InsightsJobRunner, JobOutcome, LLM_WINDOW_MS } from './insights-job-runner';

function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test('a job over the concurrency cap is rejected while the cap is full and runs once a slot frees', async () => {
  const jobRunner = new InsightsJobRunner();
  const gates = Array.from({ length: LLM_MAX_CONCURRENT_JOBS }, gate);
  const outcomes = gates.map((held, index) => jobRunner.run({ key: `held-${index}`, job: () => held.promise }));
  expect(outcomes).toEqual(gates.map(() => JobOutcome.Started));
  expect(jobRunner.run({ key: 'third', job: async () => undefined })).toBe(JobOutcome.Busy);
  expect(jobRunner.run({ key: 'held-0', job: async () => undefined })).toBe(JobOutcome.AlreadyRunning);
  gates.forEach((held) => held.open());
  await jobRunner.idle();
  expect(jobRunner.run({ key: 'third', job: async () => undefined })).toBe(JobOutcome.Started);
  await jobRunner.idle();
});

test('the model call after the hourly cap is refused and the window rolls over', () => {
  let now = 0;
  const jobRunner = new InsightsJobRunner({ now: () => now });
  const consumed = Array.from({ length: LLM_MAX_CALLS_PER_HOUR }, () => jobRunner.consumeCall());
  expect(consumed.every(Boolean)).toBe(true);
  expect(jobRunner.consumeCall()).toBe(false);
  now += LLM_WINDOW_MS - MINUTE_MS;
  expect(jobRunner.consumeCall()).toBe(false);
  now += MINUTE_MS + 1;
  expect(jobRunner.consumeCall()).toBe(true);
});

test('jobs that never reach the model do not consume the hourly budget', async () => {
  const jobRunner = new InsightsJobRunner();
  await Array.from({ length: LLM_MAX_CALLS_PER_HOUR * 2 }).reduce<Promise<void>>(async (previous, _, index) => {
    await previous;
    expect(jobRunner.run({ key: `idle-${index}`, job: async () => undefined })).toBe(JobOutcome.Started);
    await jobRunner.idle();
  }, Promise.resolve());
  expect(jobRunner.consumeCall()).toBe(true);
});

test('the worker honours the configured limits', async () => {
  const jobRunner = new InsightsJobRunner({ maxConcurrentJobs: 1, maxCallsPerHour: 2 });
  const held = gate();
  expect(jobRunner.run({ key: 'first', job: () => held.promise })).toBe(JobOutcome.Started);
  expect(jobRunner.run({ key: 'second', job: async () => undefined })).toBe(JobOutcome.Busy);
  held.open();
  await jobRunner.idle();
  expect([jobRunner.consumeCall(), jobRunner.consumeCall(), jobRunner.consumeCall()]).toEqual([true, true, false]);
});

test('checking the call budget never spends it', () => {
  const jobRunner = new InsightsJobRunner({ maxCallsPerHour: 1 });
  expect(jobRunner.hasCallBudget()).toBe(true);
  expect(jobRunner.hasCallBudget()).toBe(true);
  expect(jobRunner.consumeCall()).toBe(true);
  expect(jobRunner.hasCallBudget()).toBe(false);
});

test('the wait for a call slot runs until the oldest call leaves the window and is never below the minimum', () => {
  const clock = { time: 0 };
  const jobRunner = new InsightsJobRunner({ now: () => clock.time, maxCallsPerHour: 1 });
  expect(jobRunner.retryAfterMs()).toBe(MIN_RETRY_AFTER_MS);
  jobRunner.consumeCall();
  clock.time = 10 * MINUTE_MS;
  expect(jobRunner.retryAfterMs()).toBe(LLM_WINDOW_MS - 10 * MINUTE_MS);
  clock.time = LLM_WINDOW_MS - 1;
  expect(jobRunner.retryAfterMs()).toBe(MIN_RETRY_AFTER_MS);
});
