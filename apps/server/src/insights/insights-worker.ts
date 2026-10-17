import { HOUR_MS, MIN_RETRY_AFTER_MS } from '@superdoc-history/types';
import { describeError } from '../history/projection-messages';

export const INSIGHTS_JOB_FAILED_MESSAGE = 'Insights job failed for';
export const LLM_MAX_CONCURRENT_JOBS = 2;
export const LLM_MAX_CALLS_PER_HOUR = 60;
export const LLM_WINDOW_MS = HOUR_MS;

export enum JobOutcome {
  Started = 'started',
  AlreadyRunning = 'already-running',
  Busy = 'busy',
}

export class InsightsWorker {
  private readonly running = new Map<string, Promise<void>>();
  private readonly startedAt: number[] = [];
  private readonly now: () => number;
  private readonly maxConcurrentJobs: number;
  private readonly maxCallsPerHour: number;

  constructor({
    now = () => Date.now(),
    maxConcurrentJobs = LLM_MAX_CONCURRENT_JOBS,
    maxCallsPerHour = LLM_MAX_CALLS_PER_HOUR,
  }: { now?: () => number; maxConcurrentJobs?: number; maxCallsPerHour?: number } = {}) {
    this.now = now;
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.maxCallsPerHour = maxCallsPerHour;
  }

  run({ key, job }: { key: string; job: () => Promise<void> }): JobOutcome {
    if (this.running.has(key)) return JobOutcome.AlreadyRunning;
    if (this.running.size >= this.maxConcurrentJobs) return JobOutcome.Busy;
    const started = job()
      .catch((error) => console.error(`${INSIGHTS_JOB_FAILED_MESSAGE} ${key}: ${describeError(error)}`))
      .finally(() => this.running.delete(key));
    this.running.set(key, started);
    return JobOutcome.Started;
  }

  consumeCall(): boolean {
    if (this.callsInWindow() >= this.maxCallsPerHour) return false;
    this.startedAt.push(this.now());
    return true;
  }

  hasCallBudget(): boolean {
    return this.callsInWindow() < this.maxCallsPerHour;
  }

  retryAfterMs(): number {
    if (this.hasCallBudget()) return MIN_RETRY_AFTER_MS;
    const [oldest] = this.startedAt;
    if (oldest === undefined) return MIN_RETRY_AFTER_MS;
    return Math.max(MIN_RETRY_AFTER_MS, oldest + LLM_WINDOW_MS - this.now());
  }

  isRunning(key: string): boolean {
    return this.running.has(key);
  }

  async idle(): Promise<void> {
    if (this.running.size === 0) return;
    await Promise.all([...this.running.values()]);
    return this.idle();
  }

  private callsInWindow(): number {
    const windowStart = this.now() - LLM_WINDOW_MS;
    const recent = this.startedAt.filter((startedAt) => startedAt > windowStart);
    this.startedAt.splice(0, this.startedAt.length, ...recent);
    return recent.length;
  }
}
