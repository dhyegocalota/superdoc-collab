import {
  BOOTSTRAP_COMMIT_GRACE_MS,
  BOOTSTRAP_INTERRUPTED_RETRIES,
  BOOTSTRAP_MAX_RETRIES,
  BOOTSTRAP_MS_PER_MEGABYTE,
  BOOTSTRAP_PROGRESS_ENTRIES,
  BOOTSTRAP_RATE_CLAMP_MULTIPLE,
  BOOTSTRAP_RATE_MIN_OWNERS,
  BOOTSTRAP_RATE_SAMPLES,
  BOOTSTRAP_QUEUE_RETRY_AFTER_MS,
  BOOTSTRAP_RETRY_COOLDOWN_MS,
  DEVICE_JOB_LIFETIME_MS,
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

type DeviceClaim = { tabId: string; sockets: number };

type BootstrapJob = {
  progress: BootstrapProgress;
  attempt: string | null;
  failedAt: number | null;
  startedAt: number | null;
  isDevice: boolean;
  isReopenable: boolean;
  claim: DeviceClaim | null;
};

type QueueStanding = { queuePosition: number | null; queueWaitMs: number | null };

const NOTHING_TO_PROCESS_BYTES = 0;
const PREDICTED_JOB_KEY = 'predicted-job';
const NOT_QUEUED: QueueStanding = { queuePosition: null, queueWaitMs: null };
const BLANK_COMMIT_FAILED_MESSAGE = 'Committing a blank from the cached state failed, preparing it in the lane instead for document';

export const COMMITTED_WITHOUT_BOOTSTRAP: BootstrapProgress = {
  stage: BootstrapStage.Ready,
  done: NOTHING_TO_PROCESS_BYTES,
  total: NOTHING_TO_PROCESS_BYTES,
  stateBytes: null,
  estimatedMs: null,
  documentXmlBytes: NOTHING_TO_PROCESS_BYTES,
  preparingElapsedMs: null,
  queuePosition: null,
  queueWaitMs: null,
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

export class DeviceExpiredError extends Error {
  constructor() {
    super('The device did not commit the room within the lifetime of a device job.');
  }
}

export class DeviceClosedError extends Error {
  constructor() {
    super('The device preparing the room closed before the commit.');
  }
}

export class RoomBootstrap {
  private readonly jobs = new LruMap<BootstrapJob>({ isOverBudget: (entries) => entries.size > BOOTSTRAP_PROGRESS_ENTRIES });
  private readonly queues: Record<BootstrapLane, OwnerRoundRobinQueue<string>> = {
    [BootstrapLane.Light]: new OwnerRoundRobinQueue(),
    [BootstrapLane.Heavy]: new OwnerRoundRobinQueue(),
  };
  private readonly running: Record<BootstrapLane, string | null> = { [BootstrapLane.Light]: null, [BootstrapLane.Heavy]: null };
  private readonly conversionRates = new Map<string | null, number>();
  private readonly commitWaiters = new Map<string, () => void>();
  private readonly retries = new Map<string, number>();
  private blankState: Uint8Array | null = null;
  private blankConverting: string | null = null;
  private blankWaiting: string[] = [];
  private readonly run: BootstrapRun;
  private readonly issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
  private readonly collaborationUrl: () => string;
  private readonly ownerOf: (documentId: string) => string | null;
  private readonly documentXmlBytesOf: (documentId: string) => number;
  private readonly filePathOf: (documentId: string) => string;
  private readonly commitBlank: (parameters: { documentId: string; ownerId: string; state: Uint8Array }) => void;
  private readonly isPreparableByServer: (documentId: string) => boolean;
  private readonly now: () => number;
  private readonly onEnded: (documentId: string) => void;
  private readonly spendRetry: (parameters: { ownerId: string | null; documentXmlBytes: number }) => boolean;

  constructor({
    run,
    issueToken,
    collaborationUrl,
    ownerOf,
    documentXmlBytesOf,
    filePathOf,
    commitBlank,
    onEnded,
    spendRetry,
    isPreparableByServer,
    now = () => Date.now(),
  }: {
    run: BootstrapRun;
    issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
    collaborationUrl: () => string;
    ownerOf: (documentId: string) => string | null;
    documentXmlBytesOf: (documentId: string) => number;
    filePathOf: (documentId: string) => string;
    commitBlank: (parameters: { documentId: string; ownerId: string; state: Uint8Array }) => void;
    onEnded: (documentId: string) => void;
    spendRetry: (parameters: { ownerId: string | null; documentXmlBytes: number }) => boolean;
    isPreparableByServer: (documentId: string) => boolean;
    now?: () => number;
  }) {
    this.run = run;
    this.issueToken = issueToken;
    this.collaborationUrl = collaborationUrl;
    this.ownerOf = ownerOf;
    this.documentXmlBytesOf = documentXmlBytesOf;
    this.filePathOf = filePathOf;
    this.commitBlank = commitBlank;
    this.isPreparableByServer = isPreparableByServer;
    this.now = now;
    this.onEnded = onEnded;
    this.spendRetry = spendRetry;
  }

  isDevicePending(documentId: string): boolean {
    this.expireDevice(documentId);
    const job = this.jobs.peek(documentId);
    if (job === null) return false;
    return job.isDevice && job.progress.stage === BootstrapStage.Preparing;
  }

  isDeviceJob(documentId: string): boolean {
    this.expireDevice(documentId);
    const job = this.jobs.peek(documentId);
    if (job === null) return false;
    return job.isDevice && job.progress.stage !== BootstrapStage.Ready;
  }

  canReopenDevice({ documentId, userId }: { documentId: string; userId: string }): boolean {
    const job = this.jobs.peek(documentId);
    return job !== null && job.isReopenable && this.ownerOf(documentId) === userId;
  }

  reopenDevice({ documentId, userId }: { documentId: string; userId: string }): void {
    if (!this.canReopenDevice({ documentId, userId })) return;
    this.registerDevice(documentId);
  }

  isDeviceCreator({ documentId, userId, tabId }: { documentId: string; userId: string; tabId: string | null }): boolean {
    const isOwnerOfPendingJob = this.isDevicePending(documentId) && this.ownerOf(documentId) === userId;
    if (!isOwnerOfPendingJob) return false;
    const job = this.jobs.peek(documentId);
    if (job === null || job.attempt === null) return true;
    return job.claim !== null && job.claim.tabId === tabId;
  }

  claimDevice({ documentId, userId, tabId }: { documentId: string; userId: string; tabId: string | null }): string | null {
    const job = this.jobs.peek(documentId);
    if (job === null || !this.isDeviceCreator({ documentId, userId, tabId })) return null;
    const { claim, attempt: claimedAttempt } = job;
    const isClaimedByTab = claim !== null && claimedAttempt !== null;
    if (isClaimedByTab) {
      this.jobs.set({ key: documentId, value: { ...job, claim: { ...claim, sockets: claim.sockets + 1 } } });
      return claimedAttempt;
    }
    const attempt = randomUUID();
    const progress = { ...job.progress, stage: BootstrapStage.Preparing, done: 0, preparingElapsedMs: null };
    const newClaim = tabId === null ? null : { tabId, sockets: 1 };
    this.jobs.set({ key: documentId, value: { ...job, progress, attempt, failedAt: null, startedAt: this.now(), claim: newClaim } });
    return attempt;
  }

  deviceClosed({ documentId, attempt }: { documentId: string; attempt: string }): void {
    const job = this.jobs.peek(documentId);
    const isClaimedDevice = job !== null && job.isDevice && job.progress.stage === BootstrapStage.Preparing;
    if (!isClaimedDevice || !this.isCurrent({ documentId, attempt })) return;
    const { claim } = job;
    if (claim !== null && claim.sockets > 1) {
      this.jobs.set({ key: documentId, value: { ...job, claim: { ...claim, sockets: claim.sockets - 1 } } });
      return;
    }
    this.fail({ documentId, error: new DeviceClosedError(), isReopenable: true });
  }

  progressOf(documentId: string): BootstrapProgress | null {
    this.expireDevice(documentId);
    const job = this.jobs.peek(documentId);
    if (job === null) return null;
    return this.answerOf({ documentId, job });
  }

  isInFlight(documentId: string): boolean {
    const progress = this.progressOf(documentId);
    if (progress === null) return false;
    return progress.stage === BootstrapStage.Queued || progress.stage === BootstrapStage.Preparing;
  }

  queueWaitMs({ ownerId, documentXmlBytes }: { ownerId: string; documentXmlBytes: number }): number | null {
    if (!this.queues[bootstrapLaneOf(documentXmlBytes)].hasOwner(ownerId)) return null;
    return BOOTSTRAP_QUEUE_RETRY_AFTER_MS;
  }

  isRunningFor({ ownerId, documentXmlBytes }: { ownerId: string; documentXmlBytes: number }): boolean {
    const runningDocumentId = this.running[bootstrapLaneOf(documentXmlBytes)];
    return runningDocumentId !== null && this.ownerOf(runningDocumentId) === ownerId;
  }

  predictedWaitMs({ documentXmlBytes, ownerId }: { documentXmlBytes: number; ownerId: string }): number {
    const lane = bootstrapLaneOf(documentXmlBytes);
    const turnOrder = this.queues[lane].turnOrder({ also: { owner: ownerId, item: PREDICTED_JOB_KEY } });
    const jobsAhead = turnOrder.slice(0, turnOrder.indexOf(PREDICTED_JOB_KEY));
    return this.runningRemainingMs(lane) + this.estimatedMsOfJobs(jobsAhead);
  }

  request(documentId: string): BootstrapProgress {
    this.expireDevice(documentId);
    const answered = this.answerWithoutStarting(documentId);
    if (answered !== null) return answered;
    if (!this.isPreparableByServer(documentId)) return this.registerDevice(documentId);
    const progress = this.register(documentId);
    this.enqueue(documentId);
    return progress;
  }

  requestBlank(documentId: string): BootstrapProgress {
    const answered = this.answerWithoutStarting(documentId);
    if (answered !== null) return answered;
    const ownerId = this.ownerOf(documentId);
    if (this.blankState !== null && ownerId !== null) return this.commitFromState({ documentId, ownerId, state: this.blankState });
    if (this.blankConverting === null) {
      this.blankConverting = documentId;
      return this.request(documentId);
    }
    this.blankWaiting.push(documentId);
    return this.register(documentId);
  }

  blankCommitted({ documentId, state }: { documentId: string; state: Uint8Array }): void {
    if (documentId !== this.blankConverting) return;
    this.blankState = state;
    this.blankConverting = null;
    this.blankWaiting.splice(0).forEach((waitingId) => this.settleWaiting({ documentId: waitingId, state }));
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
          documentXmlBytes: this.documentXmlBytesOfJob(documentId),
          preparingElapsedMs: null,
          queuePosition: null,
          queueWaitMs: null,
        },
        attempt,
        failedAt: null,
        startedAt,
        isDevice: false,
        isReopenable: false,
        claim: null,
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
    this.retries.delete(documentId);
    this.jobs.set({
      key: documentId,
      value: {
        progress: {
          stage: BootstrapStage.Ready,
          done: total,
          total,
          stateBytes,
          estimatedMs: this.estimatedMsOf(documentId),
          documentXmlBytes: this.documentXmlBytesOfJob(documentId),
          preparingElapsedMs: null,
          queuePosition: null,
          queueWaitMs: null,
        },
        attempt,
        failedAt: null,
        startedAt: null,
        isDevice: job !== null && job.isDevice,
        isReopenable: false,
        claim: null,
      },
    });
    const commitWaiter = this.commitWaiters.get(documentId);
    if (commitWaiter !== undefined) commitWaiter();
  }

  forget(documentId: string): void {
    this.onEnded(documentId);
    this.retries.delete(documentId);
    this.blankWaiting = this.blankWaiting.filter((waitingId) => waitingId !== documentId);
    if (this.blankConverting === documentId) this.releaseBlankWaiters();
    this.jobs.delete(documentId);
    Object.values(this.queues).forEach((queue) => queue.remove(documentId));
  }

  private answerWithoutStarting(documentId: string): BootstrapProgress | null {
    const existing = this.jobs.peek(documentId);
    if (existing === null) return null;
    if (this.isRetryable(existing) && this.spendRetryOf({ documentId, job: existing })) return null;
    return this.answerOf({ documentId, job: existing });
  }

  private spendRetryOf({ documentId, job }: { documentId: string; job: BootstrapJob }): boolean {
    const attempts = this.retries.get(documentId);
    const retried = attempts === undefined ? 0 : attempts;
    if (retried >= BOOTSTRAP_MAX_RETRIES) return false;
    const isAllowed = this.spendRetry({ ownerId: this.ownerOf(documentId), documentXmlBytes: job.progress.documentXmlBytes });
    if (!isAllowed) return false;
    this.retries.set(documentId, retried + 1);
    return true;
  }

  private register(documentId: string): BootstrapProgress {
    const documentXmlBytes = this.documentXmlBytesOf(documentId);
    const total = documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO;
    const estimatedMs = this.estimatedMsOfBytes(documentXmlBytes);
    const progress = {
      stage: BootstrapStage.Queued,
      done: 0,
      total,
      stateBytes: null,
      estimatedMs,
      documentXmlBytes,
      preparingElapsedMs: null,
      queuePosition: null,
      queueWaitMs: null,
    };
    this.jobs.set({
      key: documentId,
      value: { progress, attempt: null, failedAt: null, startedAt: null, isDevice: false, isReopenable: false, claim: null },
    });
    return progress;
  }

  private registerDevice(documentId: string): BootstrapProgress {
    const queued = this.register(documentId);
    const job = {
      progress: { ...queued, stage: BootstrapStage.Preparing },
      attempt: null,
      failedAt: null,
      startedAt: this.now(),
      isDevice: true,
      isReopenable: false,
      claim: null,
    };
    this.jobs.set({ key: documentId, value: job });
    return this.answerOf({ documentId, job });
  }

  private enqueue(documentId: string): void {
    const lane = bootstrapLaneOf(this.documentXmlBytesOfJob(documentId));
    this.queues[lane].push({ owner: this.ownerOf(documentId), item: documentId });
    this.pump(lane);
  }

  private settleWaiting({ documentId, state }: { documentId: string; state: Uint8Array }): void {
    const ownerId = this.ownerOf(documentId);
    if (ownerId === null) return this.enqueue(documentId);
    this.commitFromState({ documentId, ownerId, state });
  }

  private commitFromState({ documentId, ownerId, state }: { documentId: string; ownerId: string; state: Uint8Array }): BootstrapProgress {
    try {
      this.commitBlank({ documentId, ownerId, state });
      const progress = this.progressOf(documentId);
      if (progress === null) throw new BootstrapUncommittedError();
      return progress;
    } catch (error) {
      console.error(`${BLANK_COMMIT_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
      const queued = this.register(documentId);
      this.enqueue(documentId);
      return queued;
    }
  }

  private releaseBlankWaiters(): void {
    this.blankConverting = null;
    this.blankWaiting.splice(0).forEach((waitingId) => this.enqueue(waitingId));
  }

  private answerOf({ documentId, job }: { documentId: string; job: BootstrapJob }): BootstrapProgress {
    if (job.progress.stage === BootstrapStage.Queued) return { ...job.progress, ...this.queueStandingOf({ documentId, job }) };
    if (job.progress.stage !== BootstrapStage.Preparing || job.startedAt === null) return job.progress;
    return { ...job.progress, preparingElapsedMs: this.now() - job.startedAt };
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

  private documentXmlBytesOfJob(documentId: string): number {
    const progress = this.progressOf(documentId);
    if (progress === null) return NOTHING_TO_PROCESS_BYTES;
    return progress.documentXmlBytes;
  }

  private queueStandingOf({ documentId, job }: { documentId: string; job: BootstrapJob }): QueueStanding {
    const lane = bootstrapLaneOf(job.progress.documentXmlBytes);
    const turnOrder = this.queues[lane].turnOrder();
    const turn = turnOrder.indexOf(documentId);
    if (turn === -1) return NOT_QUEUED;
    const runningAhead = this.running[lane] === null ? 0 : 1;
    return {
      queuePosition: runningAhead + turn,
      queueWaitMs: this.runningRemainingMs(lane) + this.estimatedMsOfJobs(turnOrder.slice(0, turn)),
    };
  }

  private runningRemainingMs(lane: BootstrapLane): number {
    const documentId = this.running[lane];
    if (documentId === null) return 0;
    const job = this.jobs.peek(documentId);
    if (job === null || job.startedAt === null) return 0;
    return Math.max(0, this.estimatedMsOfBytes(job.progress.documentXmlBytes) - (this.now() - job.startedAt));
  }

  private estimatedMsOfJobs(documentIds: string[]): number {
    return documentIds.reduce((total, documentId) => {
      const job = this.jobs.peek(documentId);
      if (job === null) return total;
      return total + this.estimatedMsOfBytes(job.progress.documentXmlBytes);
    }, 0);
  }

  private estimatedMsOfBytes(documentXmlBytes: number): number {
    return (documentXmlBytes / BYTES_PER_MEGABYTE) * this.rateMsPerMegabyte();
  }

  private rateMsPerMegabyte(): number {
    if (this.conversionRates.size < BOOTSTRAP_RATE_MIN_OWNERS) return BOOTSTRAP_MS_PER_MEGABYTE;
    const rates = [...this.conversionRates.values()];
    const measured = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    return Math.min(
      BOOTSTRAP_MS_PER_MEGABYTE * BOOTSTRAP_RATE_CLAMP_MULTIPLE,
      Math.max(BOOTSTRAP_MS_PER_MEGABYTE / BOOTSTRAP_RATE_CLAMP_MULTIPLE, measured),
    );
  }

  private recordConversion(documentId: string): void {
    const job = this.jobs.peek(documentId);
    if (job === null || job.startedAt === null) return;
    if (bootstrapLaneOf(job.progress.documentXmlBytes) !== BootstrapLane.Heavy) return;
    const megabytes = job.progress.documentXmlBytes / BYTES_PER_MEGABYTE;
    const ownerId = this.ownerOf(documentId);
    this.conversionRates.delete(ownerId);
    this.conversionRates.set(ownerId, (this.now() - job.startedAt) / megabytes);
    const [oldestOwner] = this.conversionRates.keys();
    if (this.conversionRates.size > BOOTSTRAP_RATE_SAMPLES) this.conversionRates.delete(oldestOwner!);
  }

  private totalOf(documentId: string): number {
    const progress = this.progressOf(documentId);
    if (progress === null) return NOTHING_TO_PROCESS_BYTES;
    return progress.total;
  }

  private pump(lane: BootstrapLane): void {
    if (this.running[lane] !== null) return;
    const next = this.queues[lane].shift();
    if (next === undefined) return;
    this.running[lane] = next;
    void this.runJob({ documentId: next, lane, retries: BOOTSTRAP_INTERRUPTED_RETRIES }).finally(() => {
      this.running[lane] = null;
      this.pump(lane);
    });
  }

  private async runJob({ documentId, lane, retries }: { documentId: string; lane: BootstrapLane; retries: number }): Promise<void> {
    try {
      const token = this.begin(documentId);
      await this.run({
        documentId,
        filePath: this.filePathOf(documentId),
        url: this.collaborationUrl(),
        token,
        lane,
        documentXmlBytes: this.documentXmlBytesOfJob(documentId),
      });
      await this.awaitCommit(documentId);
      this.endAttempt(documentId);
    } catch (error) {
      const isRetryable = error instanceof BootstrapInterruptedError && retries > 0;
      if (isRetryable) return this.runJob({ documentId, lane, retries: retries - 1 });
      this.fail({ documentId, error });
    }
  }

  private endAttempt(documentId: string): void {
    this.onEnded(documentId);
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

  private expireDevice(documentId: string): void {
    const job = this.jobs.peek(documentId);
    if (job === null || !job.isDevice || job.progress.stage !== BootstrapStage.Preparing || job.startedAt === null) return;
    if (this.now() - job.startedAt < DEVICE_JOB_LIFETIME_MS) return;
    this.fail({ documentId, error: new DeviceExpiredError() });
  }

  private fail({ documentId, error, isReopenable = false }: { documentId: string; error: unknown; isReopenable?: boolean }): void {
    this.onEnded(documentId);
    const job = this.jobs.peek(documentId);
    if (job === null) return;
    this.jobs.set({
      key: documentId,
      value: {
        progress: { ...job.progress, stage: BootstrapStage.Failed, done: 0, preparingElapsedMs: null },
        attempt: null,
        failedAt: this.now(),
        startedAt: null,
        isDevice: job.isDevice,
        isReopenable,
        claim: null,
      },
    });
    console.error(`${BOOTSTRAP_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
    if (this.blankConverting === documentId) this.releaseBlankWaiters();
  }
}
