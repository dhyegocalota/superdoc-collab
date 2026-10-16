import { HOUR_MS } from '@superdoc-history/types';
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

  constructor({ now = () => Date.now() }: { now?: () => number } = {}) {
    this.now = now;
  }

  run({ key, job }: { key: string; job: () => Promise<void> }): JobOutcome {
    if (this.running.has(key)) return JobOutcome.AlreadyRunning;
    if (this.running.size >= LLM_MAX_CONCURRENT_JOBS) return JobOutcome.Busy;
    if (this.callsInWindow() >= LLM_MAX_CALLS_PER_HOUR) return JobOutcome.Busy;
    this.startedAt.push(this.now());
    const started = job()
      .catch((error) => console.error(`${INSIGHTS_JOB_FAILED_MESSAGE} ${key}: ${describeError(error)}`))
      .finally(() => this.running.delete(key));
    this.running.set(key, started);
    return JobOutcome.Started;
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
