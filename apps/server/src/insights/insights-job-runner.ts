import { HOUR_MS, MIN_RETRY_AFTER_MS } from '@superdoc-collab/types';
import { LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS } from '../config/environment';
import { SlidingWindow } from '../limits/sliding-window';
import { describeError } from '../logging/describe-error';

export const INSIGHTS_JOB_FAILED_MESSAGE = 'Insights job failed for';
export const LLM_WINDOW_MS = HOUR_MS;

export enum JobOutcome {
  Started = 'started',
  AlreadyRunning = 'already-running',
  Busy = 'busy',
}

export class InsightsJobRunner {
  private readonly running = new Map<string, Promise<void>>();
  private readonly firstCallWatchers = new Map<string, () => void>();
  private readonly calls: SlidingWindow;
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
    this.calls = new SlidingWindow({ windowMs: LLM_WINDOW_MS, now });
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

  private consumeCall(): boolean {
    if (this.calls.count() >= this.maxCallsPerHour) return false;
    this.calls.record();
    return true;
  }

  consumeDocumentCall(documentId: string): boolean {
    if (!this.consumeCall()) return false;
    const watcher = this.firstCallWatchers.get(documentId);
    if (watcher === undefined) return true;
    this.firstCallWatchers.delete(documentId);
    watcher();
    return true;
  }

  watchFirstCall({ documentId, onFirstCall }: { documentId: string; onFirstCall: () => void }): () => void {
    this.firstCallWatchers.set(documentId, onFirstCall);
    return () => {
      if (this.firstCallWatchers.get(documentId) === onFirstCall) this.firstCallWatchers.delete(documentId);
    };
  }

  hasCallBudget(): boolean {
    return this.calls.count() < this.maxCallsPerHour;
  }

  retryAfterMs(): number {
    if (this.hasCallBudget()) return MIN_RETRY_AFTER_MS;
    const oldest = this.calls.oldest();
    if (oldest === null) return MIN_RETRY_AFTER_MS;
    return Math.max(MIN_RETRY_AFTER_MS, oldest + LLM_WINDOW_MS - this.now());
  }

  settled(key: string): Promise<void> {
    const running = this.running.get(key);
    if (running === undefined) return Promise.resolve();
    return running;
  }

  isRunning(key: string): boolean {
    return this.running.has(key);
  }

  async idle(): Promise<void> {
    if (this.running.size === 0) return;
    await Promise.all([...this.running.values()]);
    return this.idle();
  }
}
