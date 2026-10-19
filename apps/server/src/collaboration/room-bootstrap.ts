import { BOOTSTRAP_PROGRESS_ENTRIES, BOOTSTRAP_STATE_BYTES_RATIO, BootstrapStage, type BootstrapProgress } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { LruMap } from '../limits/lru-map';
import { BOOTSTRAP_FAILED_MESSAGE } from '../history/projection-messages';
import { describeError } from '../logging/describe-error';

export type BootstrapRun = (request: { documentId: string; filePath: string; url: string; token: string }) => Promise<void>;

type BootstrapJob = { progress: BootstrapProgress; attempt: string | null };

const NOTHING_TO_PROCESS_BYTES = 0;

export const COMMITTED_WITHOUT_BOOTSTRAP: BootstrapProgress = {
  stage: BootstrapStage.Ready,
  done: NOTHING_TO_PROCESS_BYTES,
  total: NOTHING_TO_PROCESS_BYTES,
  stateBytes: null,
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
  private readonly waiting: string[] = [];
  private isRunning = false;
  private readonly run: BootstrapRun;
  private readonly issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
  private readonly collaborationUrl: () => string;
  private readonly ownerOf: (documentId: string) => string | null;
  private readonly fileBytesOf: (documentId: string) => number;
  private readonly filePathOf: (documentId: string) => string;

  constructor({
    run,
    issueToken,
    collaborationUrl,
    ownerOf,
    fileBytesOf,
    filePathOf,
  }: {
    run: BootstrapRun;
    issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
    collaborationUrl: () => string;
    ownerOf: (documentId: string) => string | null;
    fileBytesOf: (documentId: string) => number;
    filePathOf: (documentId: string) => string;
  }) {
    this.run = run;
    this.issueToken = issueToken;
    this.collaborationUrl = collaborationUrl;
    this.ownerOf = ownerOf;
    this.fileBytesOf = fileBytesOf;
    this.filePathOf = filePathOf;
  }

  progressOf(documentId: string): BootstrapProgress | null {
    const job = this.jobs.peek(documentId);
    if (job === null) return null;
    return job.progress;
  }

  request(documentId: string): BootstrapProgress {
    const existing = this.progressOf(documentId);
    if (existing !== null) return existing;
    const total = this.fileBytesOf(documentId) * BOOTSTRAP_STATE_BYTES_RATIO;
    const progress = { stage: BootstrapStage.Queued, done: 0, total, stateBytes: null };
    this.jobs.set({ key: documentId, value: { progress, attempt: null } });
    this.waiting.push(documentId);
    this.pump();
    return progress;
  }

  begin(documentId: string): string {
    const owner = this.ownerOf(documentId);
    if (owner === null) throw new BootstrapOwnerMissingError(documentId);
    const attempt = randomUUID();
    const total = this.totalOf(documentId);
    this.jobs.set({ key: documentId, value: { progress: { stage: BootstrapStage.Preparing, done: 0, total, stateBytes: null }, attempt } });
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
    this.jobs.set({ key: documentId, value: { progress: { stage: BootstrapStage.Ready, done: total, total, stateBytes }, attempt } });
  }

  forget(documentId: string): void {
    this.jobs.delete(documentId);
    const queuedAt = this.waiting.indexOf(documentId);
    if (queuedAt !== -1) this.waiting.splice(queuedAt, 1);
  }

  private isReady(documentId: string): boolean {
    const progress = this.progressOf(documentId);
    return progress !== null && progress.stage === BootstrapStage.Ready;
  }

  private totalOf(documentId: string): number {
    const progress = this.progressOf(documentId);
    if (progress === null) return NOTHING_TO_PROCESS_BYTES;
    return progress.total;
  }

  private pump(): void {
    if (this.isRunning) return;
    const next = this.waiting.shift();
    if (next === undefined) return;
    this.isRunning = true;
    void this.runJob(next).finally(() => {
      this.isRunning = false;
      this.pump();
    });
  }

  private async runJob(documentId: string): Promise<void> {
    try {
      const token = this.begin(documentId);
      await this.run({ documentId, filePath: this.filePathOf(documentId), url: this.collaborationUrl(), token });
      if (this.isReady(documentId)) return;
      throw new BootstrapUncommittedError();
    } catch (error) {
      this.fail({ documentId, error });
    }
  }

  private fail({ documentId, error }: { documentId: string; error: unknown }): void {
    const job = this.jobs.peek(documentId);
    if (job === null) return;
    this.jobs.set({ key: documentId, value: { progress: { ...job.progress, stage: BootstrapStage.Failed, done: 0 }, attempt: null } });
    console.error(`${BOOTSTRAP_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
  }
}
