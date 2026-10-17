import { MINUTE_MS } from '@superdoc-history/types';
import { Worker } from 'node:worker_threads';
import { describeError } from '../logging/describe-error';
import {
  IMPORT_FAILED_MESSAGE,
  IMPORT_SKIPPED_MESSAGE,
  PROJECTION_FAILED_MESSAGE,
  ProjectionDegradedError,
  ProjectionReplyKind,
  ProjectionRequestCrashedError,
  ProjectionRequestKind,
  ProjectionStoppedError,
  type BlocksReply,
  type ProjectionDoneReply,
  type ProjectionFailedReply,
  type ProjectionReply,
  type ProjectionRequest,
  type VersionReply,
} from './projection-messages';

const SOURCE_EXTENSION = '.ts';
const TSX_REGISTER_SPECIFIER = 'tsx/esm/api';
const WORKER_ERROR_MESSAGE = 'Projection worker error';
const WORKER_DEGRADED_MESSAGE = 'Projection worker keeps failing; projection is disabled until the server restarts';
export const MAX_WORKER_RESTARTS_PER_WINDOW = 5;
export const WORKER_RESTART_WINDOW_MS = MINUTE_MS;

function createWorker(databaseDirectory: string): Worker {
  const workerData = { databaseDirectory };
  if (!import.meta.url.endsWith(SOURCE_EXTENSION)) return new Worker(new URL('./projection-worker.js', import.meta.url), { workerData });
  const entry = JSON.stringify(new URL('./projection-worker.ts', import.meta.url).href);
  const registerEntry = JSON.stringify(import.meta.resolve(TSX_REGISTER_SPECIFIER));
  return new Worker(`import(${registerEntry}).then(({ register }) => { register(); return import(${entry}); })`, {
    eval: true,
    workerData,
  });
}

type ServedReply = VersionReply | BlocksReply;
export const MAX_REQUEST_POSTS = 2;

type Waiter = { resolve: (reply: ServedReply) => void; reject: (error: Error) => void };
type WaitingRequest = { request: ProjectionRequest; waiters: Waiter[]; posts: number };

function versionKey({ documentId, sequence }: { documentId: string; sequence: number }): string {
  return `${ProjectionRequestKind.Version}:${documentId}@${sequence}`;
}

function blocksKey(documentId: string): string {
  return `${ProjectionRequestKind.Blocks}:${documentId}`;
}

function isServedReply(reply: ProjectionDoneReply | ServedReply): reply is ServedReply {
  return reply.kind === ProjectionRequestKind.Version || reply.kind === ProjectionRequestKind.Blocks;
}

function keyOfReply(reply: ServedReply): string {
  if (reply.kind === ProjectionRequestKind.Version) return versionKey(reply);
  return blocksKey(reply.documentId);
}

function keyOfFailure(reply: ProjectionFailedReply): string {
  if (reply.requestKind === ProjectionRequestKind.Version) return versionKey({ documentId: reply.documentId, sequence: reply.sequence });
  return blocksKey(reply.documentId);
}

export class ProjectionScheduler {
  currentWorker: Worker;
  private readonly databaseDirectory: string;
  private readonly inFlight = new Set<string>();
  private readonly pendingImports = new Map<string, string>();
  private readonly documentsNeedingRerun = new Set<string>();
  private readonly rebuildingDocuments = new Set<string>();
  private readonly reimportedDocuments = new Set<string>();
  private readonly waiting = new Map<string, WaitingRequest>();
  private readonly forgetting = new Map<string, (() => void)[]>();
  private readonly restartTimes: number[] = [];
  private readonly loggedProjectionFailures = new Set<string>();
  private isAlive = true;
  isDegraded = false;
  private readonly loggedImportFailures = new Set<string>();
  private stopping: Promise<void> | null = null;

  constructor({ databaseDirectory }: { databaseDirectory: string }) {
    this.databaseDirectory = databaseDirectory;
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

  rebuild({ documentId, filePath }: { documentId: string; filePath: string }): Promise<void> {
    if (this.isDegraded) return Promise.resolve();
    this.rebuildingDocuments.add(documentId);
    return this.forget(documentId).then(() => this.importRevisions({ documentId, filePath }));
  }

  isRebuilding(documentId: string): boolean {
    return this.rebuildingDocuments.has(documentId);
  }

  version({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionReply> {
    return this.serve({
      key: versionKey({ documentId, sequence }),
      request: { kind: ProjectionRequestKind.Version, documentId, sequence },
    }) as Promise<VersionReply>;
  }

  blocks(documentId: string): Promise<BlocksReply> {
    return this.serve({ key: blocksKey(documentId), request: { kind: ProjectionRequestKind.Blocks, documentId } }) as Promise<BlocksReply>;
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
    if (this.stopping) return this.stopping;
    if (!this.isAlive) return Promise.resolve();
    this.waiting.forEach((_, key) => this.rejectWaiters({ key, error: new ProjectionStoppedError() }));
    this.stopping = new Promise<void>((resolve) => this.currentWorker.once('exit', () => resolve()));
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
    return this.stopping;
  }

  private serve({ key, request }: { key: string; request: ProjectionRequest }): Promise<ServedReply> {
    if (this.isDegraded) return Promise.reject(new ProjectionDegradedError());
    if (this.stopping) return Promise.reject(new ProjectionStoppedError());
    return new Promise((resolve, reject) => {
      const existing = this.waiting.get(key);
      if (existing) {
        existing.waiters.push({ resolve, reject });
        return;
      }
      this.waiting.set(key, { request, waiters: [{ resolve, reject }], posts: 1 });
      this.currentWorker.postMessage(request);
    });
  }

  private spawn(): Worker {
    const worker = createWorker(this.databaseDirectory);
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
    if (reply.kind === ProjectionReplyKind.Failed) return this.settleFailure(reply);
    return this.settleDone(reply);
  }

  private settleFailure(reply: ProjectionFailedReply): void {
    const { documentId, message, requestKind } = reply;
    if (requestKind === ProjectionRequestKind.Version || requestKind === ProjectionRequestKind.Blocks)
      return this.rejectWaiters({ key: keyOfFailure(reply), error: new Error(message) });
    this.rebuildingDocuments.delete(documentId);
    this.reimportedDocuments.delete(documentId);
    this.settleForget(documentId);
    this.inFlight.delete(documentId);
    this.documentsNeedingRerun.delete(documentId);
    if (this.loggedProjectionFailures.has(documentId)) return;
    this.loggedProjectionFailures.add(documentId);
    console.error(`${PROJECTION_FAILED_MESSAGE} ${documentId}: ${message}`);
  }

  private settleDone(reply: ProjectionDoneReply | ServedReply): void {
    if (isServedReply(reply)) return this.resolveWaiters(reply);
    const { kind, documentId, importError } = reply;
    if (kind === ProjectionRequestKind.Forget) return this.settleForget(documentId);
    if (kind === ProjectionRequestKind.Import) this.pendingImports.delete(documentId);
    if (kind === ProjectionRequestKind.Import && this.rebuildingDocuments.has(documentId)) {
      this.reimportedDocuments.add(documentId);
      this.schedule(documentId);
    }
    if (importError !== null) return this.reportImportFailure({ documentId, importError });
    if (kind !== ProjectionRequestKind.Project) return;
    this.inFlight.delete(documentId);
    if (this.documentsNeedingRerun.delete(documentId)) return this.schedule(documentId);
    if (this.reimportedDocuments.delete(documentId)) this.rebuildingDocuments.delete(documentId);
  }

  private resolveWaiters(reply: ServedReply): void {
    const key = keyOfReply(reply);
    const entry = this.waiting.get(key);
    this.waiting.delete(key);
    if (entry) entry.waiters.forEach(({ resolve }) => resolve(reply));
  }

  private rejectWaiters({ key, error }: { key: string; error: Error }): void {
    const entry = this.waiting.get(key);
    this.waiting.delete(key);
    if (entry) entry.waiters.forEach(({ reject }) => reject(error));
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
    if (this.stopping) return;
    if (!this.withinRestartBudget()) return this.degrade();
    this.currentWorker = this.spawn();
    const pending = [...this.inFlight];
    this.inFlight.clear();
    pending.forEach((documentId) => this.schedule(documentId));
    this.pendingImports.forEach((filePath, documentId) =>
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Import, documentId, filePath }),
    );
    [...this.forgetting.keys()].forEach((documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId }));
    this.repostWaiting();
  }

  private repostWaiting(): void {
    [...this.waiting].forEach(([key, waiting]) => {
      if (waiting.posts >= MAX_REQUEST_POSTS) return this.rejectWaiters({ key, error: new ProjectionRequestCrashedError() });
      waiting.posts += 1;
      this.currentWorker.postMessage(waiting.request);
    });
  }

  private withinRestartBudget(): boolean {
    const now = Date.now();
    this.restartTimes.push(now);
    const recent = this.restartTimes.filter((time) => now - time < WORKER_RESTART_WINDOW_MS);
    this.restartTimes.splice(0, this.restartTimes.length, ...recent);
    return recent.length <= MAX_WORKER_RESTARTS_PER_WINDOW;
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
    [...this.waiting.keys()].forEach((key) => this.rejectWaiters({ key, error: new ProjectionDegradedError() }));
  }
}
