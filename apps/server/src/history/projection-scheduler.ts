import { LARGE_DOCUMENT_HEAP_BYTES, MAX_PENDING_VERSION_JOBS, MINUTE_MS, PROJECTION_WORKER_QUIET_MS } from '@superdoc-collab/types';
import { Worker } from 'node:worker_threads';
import { SlidingWindow } from '../limits/sliding-window';
import { describeError } from '../logging/describe-error';
import {
  IMPORT_FAILED_MESSAGE,
  IMPORT_SKIPPED_MESSAGE,
  PROJECTION_FAILED_MESSAGE,
  BootstrapInterruptedError,
  ProjectionBusyError,
  ProjectionDegradedError,
  ProjectionReplyKind,
  ProjectionRequestKind,
  ProjectionStoppedError,
  WORKER_RECYCLED_MESSAGE,
  type BlocksReply,
  type BootstrapReply,
  type ProjectionDoneReply,
  type ProjectionFailedReply,
  type ProjectionReply,
  type VersionReply,
} from './projection-messages';
import { isServedReply, requestKeyOf, WaitingRequests, type ServedReply, type ServedRequest } from './waiting-requests';

const SOURCE_EXTENSION = '.ts';
const TSX_REGISTER_SPECIFIER = 'tsx/esm/api';
const WORKER_ERROR_MESSAGE = 'Projection worker error';
const WORKER_DEGRADED_MESSAGE = 'Projection worker keeps failing; projection is disabled until the server restarts';
export const MAX_WORKER_RESTARTS_PER_WINDOW = 5;
const WORKER_RESTART_WINDOW_MS = MINUTE_MS;

function createWorker({
  databaseDirectory,
  projectionWorkerFile,
  workerHeapMegabytes,
}: {
  databaseDirectory: string;
  projectionWorkerFile: URL | null;
  workerHeapMegabytes: number | null;
}): Worker {
  const workerData = { databaseDirectory };
  const heapLimit = workerHeapMegabytes === null ? {} : { resourceLimits: { maxOldGenerationSizeMb: workerHeapMegabytes } };
  if (projectionWorkerFile) return new Worker(projectionWorkerFile, { workerData, ...heapLimit });
  if (!import.meta.url.endsWith(SOURCE_EXTENSION))
    return new Worker(new URL('./projection-worker.js', import.meta.url), { workerData, ...heapLimit });
  const entry = JSON.stringify(new URL('./projection-worker.ts', import.meta.url).href);
  const registerEntry = JSON.stringify(import.meta.resolve(TSX_REGISTER_SPECIFIER));
  return new Worker(`import(${registerEntry}).then(({ register }) => { register(); return import(${entry}); })`, {
    eval: true,
    workerData,
    ...heapLimit,
  });
}

export const MAX_REQUEST_POSTS = 2;

type BootstrapWaiter = { request: BootstrapRequest; resolve: () => void; reject: (error: Error) => void };
export type BootstrapRequest = { documentId: string; filePath: string; url: string; token: string };

export class ProjectionScheduler {
  currentWorker: Worker;
  private readonly databaseDirectory: string;
  private readonly projectionWorkerFile: URL | null;
  private readonly workerHeapMegabytes: number | null;
  private readonly recycleQuietMs: number;
  private recycleTimer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();
  private readonly pendingImports = new Map<string, string>();
  private readonly documentsNeedingRerun = new Set<string>();
  private readonly rebuildingDocuments = new Set<string>();
  private readonly reimportedDocuments = new Set<string>();
  private readonly waitingRequests = new WaitingRequests();
  private readonly forgetting = new Map<string, (() => void)[]>();
  private readonly bootstrapping = new Map<string, BootstrapWaiter>();
  private readonly restarts = new SlidingWindow({ windowMs: WORKER_RESTART_WINDOW_MS });
  private readonly loggedProjectionFailures = new Set<string>();
  private isAlive = true;
  private isRecycling = false;
  isDegraded = false;
  private readonly loggedImportFailures = new Set<string>();
  private stoppingPromise: Promise<void> | null = null;

  constructor({
    databaseDirectory,
    projectionWorkerFile = null,
    workerHeapMegabytes = null,
    recycleQuietMs = PROJECTION_WORKER_QUIET_MS,
  }: {
    databaseDirectory: string;
    projectionWorkerFile?: URL | null;
    workerHeapMegabytes?: number | null;
    recycleQuietMs?: number;
  }) {
    this.databaseDirectory = databaseDirectory;
    this.projectionWorkerFile = projectionWorkerFile;
    this.workerHeapMegabytes = workerHeapMegabytes;
    this.recycleQuietMs = recycleQuietMs;
    this.currentWorker = this.spawn();
  }

  schedule(documentId: string): void {
    if (this.isDegraded) return;
    if (this.inFlight.has(documentId)) {
      this.documentsNeedingRerun.add(documentId);
      return;
    }
    this.inFlight.add(documentId);
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Project, documentId });
  }

  importRevisions({ documentId, filePath }: { documentId: string; filePath: string }): void {
    if (this.isDegraded) return console.error(`${IMPORT_SKIPPED_MESSAGE} ${documentId}`);
    this.pendingImports.set(documentId, filePath);
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Import, documentId, filePath });
  }

  bootstrap(request: BootstrapRequest): Promise<void> {
    if (this.isDegraded) return Promise.reject(new ProjectionDegradedError());
    if (this.stoppingPromise) return Promise.reject(new ProjectionStoppedError());
    return new Promise((resolve, reject) => {
      this.bootstrapping.set(request.documentId, { request, resolve, reject });
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Bootstrap, ...request });
    });
  }

  rebuild({ documentId, filePath }: { documentId: string; filePath: string }): Promise<void> {
    if (this.isDegraded) return Promise.resolve();
    this.rebuildingDocuments.add(documentId);
    return this.forget(documentId).then(() => this.importRevisions({ documentId, filePath }));
  }

  isRebuilding(documentId: string): boolean {
    return this.rebuildingDocuments.has(documentId);
  }

  refusesVersion({ documentId, sequence }: { documentId: string; sequence: number }): boolean {
    const isFull = this.waitingRequests.pendingOfKind(ProjectionRequestKind.Version) >= MAX_PENDING_VERSION_JOBS;
    return isFull && !this.waitingRequests.has({ kind: ProjectionRequestKind.Version, documentId, sequence });
  }

  // NB ADR 0044: above the pending cap a version build is refused, never queued behind the serial worker.
  version({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionReply> {
    if (this.refusesVersion({ documentId, sequence })) return Promise.reject(new ProjectionBusyError());
    const request = { kind: ProjectionRequestKind.Version, documentId, sequence } as const;
    return this.serve(request) as Promise<VersionReply>;
  }

  blocks(documentId: string): Promise<BlocksReply> {
    return this.serve({ kind: ProjectionRequestKind.Blocks, documentId }) as Promise<BlocksReply>;
  }

  forget(documentId: string): Promise<void> {
    if (this.isDegraded) return Promise.resolve();
    this.pendingImports.delete(documentId);
    return new Promise((resolve) => {
      this.forgetting.set(documentId, [...this.waitingForgets(documentId), resolve]);
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId });
    });
  }

  stop(): Promise<void> {
    if (this.stoppingPromise) return this.stoppingPromise;
    if (!this.isAlive) return Promise.resolve();
    this.waitingRequests.rejectAll(() => new ProjectionStoppedError());
    this.rejectBootstrapping(() => new ProjectionStoppedError());
    this.stoppingPromise = new Promise<void>((resolve) => this.currentWorker.once('exit', () => resolve()));
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
    return this.stoppingPromise;
  }

  private serve(request: ServedRequest): Promise<ServedReply> {
    if (this.isDegraded) return Promise.reject(new ProjectionDegradedError());
    if (this.stoppingPromise) return Promise.reject(new ProjectionStoppedError());
    return new Promise((resolve, reject) => {
      const isNewRequest = this.waitingRequests.add({ request, waiter: { resolve, reject } });
      if (isNewRequest) this.currentWorker.postMessage(request);
    });
  }

  private spawn(): Worker {
    const worker = createWorker({
      databaseDirectory: this.databaseDirectory,
      projectionWorkerFile: this.projectionWorkerFile,
      workerHeapMegabytes: this.workerHeapMegabytes,
    });
    this.isAlive = true;
    worker.on('message', (reply: ProjectionReply) => this.settle(reply));
    worker.on('error', (error) => console.error(`${WORKER_ERROR_MESSAGE}: ${describeError(error)}`));
    worker.on('exit', () => {
      this.isAlive = false;
      this.restart();
    });
    return worker;
  }

  private settle(reply: ProjectionReply): void {
    if (reply.kind !== ProjectionReplyKind.Failed) this.recycleWhenHeavy(reply.heapTotalBytes);
    if (reply.kind === ProjectionReplyKind.Failed) return this.settleFailure(reply);
    if (isServedReply(reply)) return this.waitingRequests.resolve(reply);
    if (reply.kind === ProjectionRequestKind.Bootstrap) return this.settleBootstrap(reply);
    if (reply.kind === ProjectionRequestKind.Forget) return this.settleForget(reply.documentId);
    if (reply.kind === ProjectionRequestKind.Import) return this.settleImport(reply);
    return this.settleProject(reply);
  }

  private recycleWhenHeavy(heapTotalBytes: number): void {
    if (this.recycleTimer) clearTimeout(this.recycleTimer);
    this.recycleTimer = null;
    const isHeavy = heapTotalBytes > LARGE_DOCUMENT_HEAP_BYTES;
    if (!isHeavy || this.isRecycling || this.stoppingPromise) return;
    this.recycleTimer = setTimeout(() => this.recycleWhenIdle(heapTotalBytes), this.recycleQuietMs);
    this.recycleTimer.unref();
  }

  private isIdle(): boolean {
    const hasNoQueuedWork = this.inFlight.size === 0 && this.pendingImports.size === 0 && this.forgetting.size === 0;
    return hasNoQueuedWork && this.bootstrapping.size === 0 && this.waitingRequests.isEmpty();
  }

  private recycleWhenIdle(heapTotalBytes: number): void {
    this.recycleTimer = null;
    if (!this.isIdle() || this.isRecycling || this.stoppingPromise) return;
    this.isRecycling = true;
    console.info(`${WORKER_RECYCLED_MESSAGE} ${heapTotalBytes}`);
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
  }

  private settleFailure(reply: ProjectionFailedReply): void {
    const { documentId, message, requestKind } = reply;
    if (requestKind === ProjectionRequestKind.Bootstrap) return this.takeBootstrapWaiter(documentId)?.reject(new Error(message));
    if (requestKind === ProjectionRequestKind.Version || requestKind === ProjectionRequestKind.Blocks)
      return this.waitingRequests.reject({
        key: requestKeyOf({ kind: requestKind, documentId, sequence: reply.sequence }),
        error: new Error(message),
      });
    this.rebuildingDocuments.delete(documentId);
    this.reimportedDocuments.delete(documentId);
    this.settleForget(documentId);
    this.inFlight.delete(documentId);
    this.documentsNeedingRerun.delete(documentId);
    if (this.loggedProjectionFailures.has(documentId)) return;
    this.loggedProjectionFailures.add(documentId);
    console.error(`${PROJECTION_FAILED_MESSAGE} ${documentId}: ${message}`);
  }

  private settleBootstrap({ documentId }: BootstrapReply): void {
    this.takeBootstrapWaiter(documentId)?.resolve();
  }

  private takeBootstrapWaiter(documentId: string): BootstrapWaiter | null {
    const waiter = this.bootstrapping.get(documentId);
    this.bootstrapping.delete(documentId);
    if (waiter === undefined) return null;
    return waiter;
  }

  private repostBootstrapping(): void {
    this.bootstrapping.forEach(({ request }) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Bootstrap, ...request }));
  }

  private rejectBootstrapping(errorOf: () => Error): void {
    this.bootstrapping.forEach(({ reject }) => reject(errorOf()));
    this.bootstrapping.clear();
  }

  private settleImport({ documentId, importError }: ProjectionDoneReply): void {
    this.pendingImports.delete(documentId);
    if (this.rebuildingDocuments.has(documentId)) this.projectReimported(documentId);
    if (importError !== null) this.reportImportFailure({ documentId, importError });
  }

  private projectReimported(documentId: string): void {
    this.reimportedDocuments.add(documentId);
    this.schedule(documentId);
  }

  private settleProject({ documentId }: ProjectionDoneReply): void {
    this.inFlight.delete(documentId);
    if (this.documentsNeedingRerun.delete(documentId)) return this.schedule(documentId);
    if (this.reimportedDocuments.delete(documentId)) this.rebuildingDocuments.delete(documentId);
  }

  private reportImportFailure({ documentId, importError }: { documentId: string; importError: string }): void {
    if (this.loggedImportFailures.has(documentId)) return;
    this.loggedImportFailures.add(documentId);
    console.error(`${IMPORT_FAILED_MESSAGE} ${documentId}: ${importError}`);
  }

  private waitingForgets(documentId: string): (() => void)[] {
    const resolvers = this.forgetting.get(documentId);
    if (!resolvers) return [];
    return resolvers;
  }

  private settleForget(documentId: string): void {
    const resolvers = this.forgetting.get(documentId);
    this.forgetting.delete(documentId);
    if (resolvers) resolvers.forEach((resolve) => resolve());
  }

  private restart(): void {
    if (this.stoppingPromise) return;
    const wasRecycled = this.isRecycling;
    this.isRecycling = false;
    if (wasRecycled) this.repostBootstrapping();
    if (!wasRecycled) this.rejectBootstrapping(() => new BootstrapInterruptedError());
    if (!wasRecycled && !this.withinRestartBudget()) return this.degrade();
    this.currentWorker = this.spawn();
    const pending = [...this.inFlight];
    this.inFlight.clear();
    pending.forEach((documentId) => this.schedule(documentId));
    this.pendingImports.forEach((filePath, documentId) =>
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Import, documentId, filePath }),
    );
    [...this.forgetting.keys()].forEach((documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId }));
    this.waitingRequests.repost({ post: (request) => this.currentWorker.postMessage(request), maxPosts: MAX_REQUEST_POSTS });
  }

  private withinRestartBudget(): boolean {
    this.restarts.record();
    return this.restarts.count() <= MAX_WORKER_RESTARTS_PER_WINDOW;
  }

  private degrade(): void {
    this.isDegraded = true;
    console.error(WORKER_DEGRADED_MESSAGE);
    [...this.forgetting.keys()].forEach((documentId) => this.settleForget(documentId));
    this.inFlight.clear();
    this.pendingImports.clear();
    this.documentsNeedingRerun.clear();
    this.rebuildingDocuments.clear();
    this.reimportedDocuments.clear();
    this.waitingRequests.rejectAll(() => new ProjectionDegradedError());
  }
}
