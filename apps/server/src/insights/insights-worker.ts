import { describeError } from '../history/projection-messages';

export const INSIGHTS_JOB_FAILED_MESSAGE = 'Insights job failed for';

export class InsightsWorker {
  private readonly running = new Map<string, Promise<void>>();

  run({ key, job }: { key: string; job: () => Promise<void> }): boolean {
    if (this.running.has(key)) return false;
    const started = job()
      .catch((error) => console.error(`${INSIGHTS_JOB_FAILED_MESSAGE} ${key}: ${describeError(error)}`))
      .finally(() => this.running.delete(key));
    this.running.set(key, started);
    return true;
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
