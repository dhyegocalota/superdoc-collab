import {
  BOOTSTRAP_COMMIT_GRACE_MS,
  BOOTSTRAP_INTERRUPTED_RETRIES,
  BOOTSTRAP_MS_PER_MEGABYTE,
  BOOTSTRAP_PROGRESS_ENTRIES,
  BOOTSTRAP_RATE_SAMPLES,
  BOOTSTRAP_QUEUE_RETRY_AFTER_MS,
  BOOTSTRAP_RETRY_COOLDOWN_MS,
  BOOTSTRAP_STATE_BYTES_RATIO,
  BootstrapLane,
  bootstrapLaneOf,
  BootstrapStage,
  BYTES_PER_MEGABYTE,
  type BootstrapProgress,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { LruMap } from '../limits/lru-map';
import { OwnerRoundRobinQueue } from '../limits/owner-round-robin-queue';
import { withTimeout } from '../limits/with-timeout';
import { BOOTSTRAP_FAILED_MESSAGE, BootstrapInterruptedError, type BootstrapRequest } from '../history/projection-messages';
import { describeError } from '../logging/describe-error';

export type BootstrapRun = (request: BootstrapRequest) => Promise<void>;

type BootstrapJob = { progress: BootstrapProgress; attempt: string | null; failedAt: number | null; startedAt: number | null };

const NOTHING_TO_PROCESS_BYTES = 0;

export const COMMITTED_WITHOUT_BOOTSTRAP: BootstrapProgress = {
  stage: BootstrapStage.Ready,
  done: NOTHING_TO_PROCESS_BYTES,
  total: NOTHING_TO_PROCESS_BYTES,
  stateBytes: null,
  estimatedMs: null,
  fileBytes: NOTHING_TO_PROCESS_BYTES,
  preparingElapsedMs: null,
};

export class BootstrapOwnerMissingError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} has no owner to bootstrap as.`);
  }
}

export class BootstrapUncommittedError extends Error {
  constructor() {
    super('The bootstrap finished without committing the room.');
  }
}

export class RoomBootstrap {
  private readonly jobs = new LruMap<BootstrapJob>({ isOverBudget: (entries) => entries.size > BOOTSTRAP_PROGRESS_ENTRIES });
  private readonly queues: Record<BootstrapLane, OwnerRoundRobinQueue<string>> = {
    [BootstrapLane.Light]: new OwnerRoundRobinQueue(),
    [BootstrapLane.Heavy]: new OwnerRoundRobinQueue(),
  };
  private readonly running: Record<BootstrapLane, boolean> = { [BootstrapLane.Light]: false, [BootstrapLane.Heavy]: false };
  private readonly conversionRates: number[] = [];
  private readonly commitWaiters = new Map<string, () => void>();
  private readonly run: BootstrapRun;
  private readonly issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
  private readonly collaborationUrl: () => string;
  private readonly ownerOf: (documentId: string) => string | null;
  private readonly fileBytesOf: (documentId: string) => number;
  private readonly filePathOf: (documentId: string) => string;
  private readonly now: () => number;

  constructor({
    run,
    issueToken,
    collaborationUrl,
    ownerOf,
    fileBytesOf,
    filePathOf,
    now = () => Date.now(),
  }: {
    run: BootstrapRun;
    issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
    collaborationUrl: () => string;
    ownerOf: (documentId: string) => string | null;
    fileBytesOf: (documentId: string) => number;
    filePathOf: (documentId: string) => string;
    now?: () => number;
  }) {
    this.run = run;
    this.issueToken = issueToken;
    this.collaborationUrl = collaborationUrl;
    this.ownerOf = ownerOf;
    this.fileBytesOf = fileBytesOf;
    this.filePathOf = filePathOf;
    this.now = now;
  }

  progressOf(documentId: string): BootstrapProgress | null {
    const job = this.jobs.peek(documentId);
    if (job === null) return null;
    return job.progress;
  }

  isInFlight(documentId: string): boolean {
    const progress = this.progressOf(documentId);
    if (progress === null) return false;
    return progress.stage === BootstrapStage.Queued || progress.stage === BootstrapStage.Preparing;
  }

  queueWaitMs({ ownerId, fileBytes }: { ownerId: string; fileBytes: number }): number | null {
    if (!this.queues[bootstrapLaneOf(fileBytes)].hasOwner(ownerId)) return null;
    return BOOTSTRAP_QUEUE_RETRY_AFTER_MS;
  }

  request(documentId: string): BootstrapProgress {
    const existing = this.jobs.peek(documentId);
    if (existing !== null && !this.isRetryable(existing)) return existing.progress;
    const fileBytes = this.fileBytesOf(documentId);
    const total = fileBytes * BOOTSTRAP_STATE_BYTES_RATIO;
    const estimatedMs = (fileBytes / BYTES_PER_MEGABYTE) * this.rateMsPerMegabyte();
    const progress = { stage: BootstrapStage.Queued, done: 0, total, stateBytes: null, estimatedMs, fileBytes, preparingElapsedMs: null };
    this.jobs.set({ key: documentId, value: { progress, attempt: null, failedAt: null, startedAt: null } });
    const lane = bootstrapLaneOf(fileBytes);
    this.queues[lane].push({ owner: this.ownerOf(documentId), item: documentId });
    this.pump(lane);
    return progress;
  }

  begin(documentId: string): string {
    const owner = this.ownerOf(documentId);
    if (owner === null) throw new BootstrapOwnerMissingError(documentId);
    const attempt = randomUUID();
    const total = this.totalOf(documentId);
    const startedAt = this.now();
    this.jobs.set({
      key: documentId,
      value: {
        progress: {
          stage: BootstrapStage.Preparing,
          done: 0,
          total,
          stateBytes: null,
          estimatedMs: this.estimatedMsOf(documentId),
          fileBytes: this.fileBytesOfJob(documentId),
          preparingElapsedMs: null,
        },
        attempt,
        failedAt: null,
        startedAt,
      },
    });
    return this.issueToken({ userId: owner, documentId, attempt });
  }

  isCurrent({ documentId, attempt }: { documentId: string; attempt: string }): boolean {
    const job = this.jobs.peek(documentId);
    if (job === null) return false;
    return job.attempt === attempt;
  }

  received({ documentId, bytes }: { documentId: string; bytes: number }): void {
    const job = this.jobs.peek(documentId);
    if (job === null) return;
    if (job.progress.stage !== BootstrapStage.Preparing) return;
    const done = Math.max(0, Math.min(job.progress.done + bytes, job.progress.total - 1));
    this.jobs.set({ key: documentId, value: { ...job, progress: { ...job.progress, done } } });
  }

  ready({ documentId, stateBytes }: { documentId: string; stateBytes: number }): void {
    const job = this.jobs.peek(documentId);
    const total = this.totalOf(documentId);
    const attempt = job === null ? null : job.attempt;
    this.recordConversion(documentId);
    this.jobs.set({
      key: documentId,
      value: {
        progress: {
          stage: BootstrapStage.Ready,
          done: total,
          total,
          stateBytes,
          estimatedMs: this.estimatedMsOf(documentId),
          fileBytes: this.fileBytesOfJob(documentId),
          preparingElapsedMs: null,
        },
        attempt,
        failedAt: null,
        startedAt: null,
      },
    });
    const commitWaiter = this.commitWaiters.get(documentId);
    if (commitWaiter !== undefined) commitWaiter();
  }

  forget(documentId: string): void {
    this.jobs.delete(documentId);
    Object.values(this.queues).forEach((queue) => queue.remove(documentId));
  }

  private isRetryable(job: BootstrapJob): boolean {
    if (job.failedAt === null) return false;
    return this.now() - job.failedAt >= BOOTSTRAP_RETRY_COOLDOWN_MS;
  }

  private isReady(documentId: string): boolean {
    const progress = this.progressOf(documentId);
    return progress !== null && progress.stage === BootstrapStage.Ready;
  }

  private estimatedMsOf(documentId: string): number | null {
    const progress = this.progressOf(documentId);
    if (progress === null) return null;
    return progress.estimatedMs;
  }

  private fileBytesOfJob(documentId: string): number {
    const progress = this.progressOf(documentId);
    if (progress === null) return NOTHING_TO_PROCESS_BYTES;
    return progress.fileBytes;
  }

  private rateMsPerMegabyte(): number {
    if (this.conversionRates.length === 0) return BOOTSTRAP_MS_PER_MEGABYTE;
    return this.conversionRates.reduce((sum, rate) => sum + rate, 0) / this.conversionRates.length;
  }

  private recordConversion(documentId: string): void {
    const job = this.jobs.peek(documentId);
    if (job === null || job.startedAt === null) return;
    if (bootstrapLaneOf(job.progress.fileBytes) !== BootstrapLane.Heavy) return;
    const megabytes = job.progress.fileBytes / BYTES_PER_MEGABYTE;
    this.conversionRates.push((this.now() - job.startedAt) / megabytes);
    if (this.conversionRates.length > BOOTSTRAP_RATE_SAMPLES) this.conversionRates.shift();
  }

  private totalOf(documentId: string): number {
    const progress = this.progressOf(documentId);
    if (progress === null) return NOTHING_TO_PROCESS_BYTES;
    return progress.total;
  }

  private pump(lane: BootstrapLane): void {
    if (this.running[lane]) return;
    const next = this.queues[lane].shift();
    if (next === undefined) return;
    this.running[lane] = true;
    void this.runJob({ documentId: next, lane, retries: BOOTSTRAP_INTERRUPTED_RETRIES }).finally(() => {
      this.running[lane] = false;
      this.pump(lane);
    });
  }

  private async runJob({ documentId, lane, retries }: { documentId: string; lane: BootstrapLane; retries: number }): Promise<void> {
    try {
      const token = this.begin(documentId);
      await this.run({ documentId, filePath: this.filePathOf(documentId), url: this.collaborationUrl(), token, lane });
      await this.awaitCommit(documentId);
      this.endAttempt(documentId);
    } catch (error) {
      const isRetryable = error instanceof BootstrapInterruptedError && retries > 0;
      if (isRetryable) return this.runJob({ documentId, lane, retries: retries - 1 });
      this.fail({ documentId, error });
    }
  }

  private endAttempt(documentId: string): void {
    const job = this.jobs.peek(documentId);
    if (job === null) return;
    this.jobs.set({ key: documentId, value: { ...job, attempt: null } });
  }

  private async awaitCommit(documentId: string): Promise<void> {
    if (this.isReady(documentId)) return;
    await withTimeout({
      work: new Promise<void>((resolve) => this.commitWaiters.set(documentId, resolve)),
      milliseconds: BOOTSTRAP_COMMIT_GRACE_MS,
      onTimeout: () => undefined,
    });
    this.commitWaiters.delete(documentId);
    if (this.isReady(documentId)) return;
    throw new BootstrapUncommittedError();
  }

  private fail({ documentId, error }: { documentId: string; error: unknown }): void {
    const job = this.jobs.peek(documentId);
    if (job === null) return;
    this.jobs.set({
      key: documentId,
      value: {
        progress: { ...job.progress, stage: BootstrapStage.Failed, done: 0, preparingElapsedMs: null },
        attempt: null,
        failedAt: this.now(),
        startedAt: null,
      },
    });
    console.error(`${BOOTSTRAP_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
  }
}
