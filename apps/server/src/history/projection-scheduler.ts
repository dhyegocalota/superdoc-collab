import { Worker } from 'node:worker_threads';
import { describeError, IMPORT_FAILED_MESSAGE, IMPORT_SKIPPED_MESSAGE, PROJECTION_FAILED_MESSAGE, ProjectionDegradedError, ProjectionReplyKind, ProjectionRequestKind, type BlocksReply, type ProjectionDoneReply, type ProjectionFailedReply, type ProjectionReply, type ProjectionRequest, type VersionReply } from './projection-messages';

const SOURCE_EXTENSION = '.ts';
const TSX_REGISTER_SPECIFIER = 'tsx/esm/api';
const WORKER_ERROR_MESSAGE = 'Projection worker error';
const WORKER_DEGRADED_MESSAGE = 'Projection worker keeps failing; projection is disabled until the server restarts';
export const MAX_WORKER_RESTARTS_PER_WINDOW = 5;
export const WORKER_RESTART_WINDOW_MS = 60_000;

function createWorker(databaseDirectory: string): Worker {
  const workerData = { databaseDirectory };
  if (!import.meta.url.endsWith(SOURCE_EXTENSION)) return new Worker(new URL('./projection-worker.js', import.meta.url), { workerData });
  const entry = JSON.stringify(new URL('./projection-worker.ts', import.meta.url).href);
  const registerEntry = JSON.stringify(import.meta.resolve(TSX_REGISTER_SPECIFIER));
  return new Worker(`import(${registerEntry}).then(({ register }) => { register(); return import(${entry}); })`, { eval: true, workerData });
}

type ServedReply = VersionReply | BlocksReply;
type Waiter = { resolve: (reply: ServedReply) => void; reject: (error: Error) => void };
type WaitingRequest = { request: ProjectionRequest; waiters: Waiter[] };

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

function keyOfFailure({ requestKind, documentId, sequence }: ProjectionFailedReply): string {
  if (requestKind === ProjectionRequestKind.Version && sequence !== null) return versionKey({ documentId, sequence });
  return blocksKey(documentId);
}

export class ProjectionScheduler {
  currentWorker: Worker;
  private readonly databaseDirectory: string;
  private readonly inFlight = new Set<string>();
  private readonly pendingImports = new Map<string, string>();
  private readonly rerun = new Set<string>();
  private readonly rebuilding = new Set<string>();
  private readonly waiting = new Map<string, WaitingRequest>();
  private readonly forgetting = new Map<string, (() => void)[]>();
  private readonly restartTimes: number[] = [];
  private readonly loggedProjectionFailures = new Set<string>();
  private alive = true;
  degraded = false;
  private readonly loggedImportFailures = new Set<string>();
  private stopping: Promise<void> | null = null;

  constructor({ databaseDirectory }: { databaseDirectory: string }) {
    this.databaseDirectory = databaseDirectory;
    this.currentWorker = this.spawn();
  }

  schedule(documentId: string): void {
    if (this.degraded) return;
    if (this.inFlight.has(documentId)) {
      this.rerun.add(documentId);
      return;
    }
    this.inFlight.add(documentId);
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Project, documentId });
  }

  importRevisions({ documentId, filePath }: { documentId: string; filePath: string }): void {
    if (this.degraded) return console.error(`${IMPORT_SKIPPED_MESSAGE} ${documentId}`);
    this.pendingImports.set(documentId, filePath);
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Import, documentId, filePath });
  }

  rebuild({ documentId, filePath }: { documentId: string; filePath: string }): Promise<void> {
    this.rebuilding.add(documentId);
    return this.forget(documentId).then(() => this.importRevisions({ documentId, filePath }));
  }

  isRebuilding(documentId: string): boolean {
    return this.rebuilding.has(documentId);
  }

  version({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionReply> {
    return this.serve({ key: versionKey({ documentId, sequence }), request: { kind: ProjectionRequestKind.Version, documentId, sequence } }) as Promise<VersionReply>;
  }

  blocks(documentId: string): Promise<BlocksReply> {
    return this.serve({ key: blocksKey(documentId), request: { kind: ProjectionRequestKind.Blocks, documentId } }) as Promise<BlocksReply>;
  }

  forget(documentId: string): Promise<void> {
    if (this.degraded) return Promise.resolve();
    this.pendingImports.delete(documentId);
    return new Promise((resolve) => {
      this.forgetting.set(documentId, [...this.waitingForgets(documentId), resolve]);
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId });
    });
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!this.alive) return Promise.resolve();
    this.stopping = new Promise<void>((resolve) => this.currentWorker.once('exit', () => resolve()));
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
    return this.stopping;
  }

  private serve({ key, request }: { key: string; request: ProjectionRequest }): Promise<ServedReply> {
    if (this.degraded) return Promise.reject(new ProjectionDegradedError());
    return new Promise((resolve, reject) => {
      const existing = this.waiting.get(key);
      if (existing) {
        existing.waiters.push({ resolve, reject });
        return;
      }
      this.waiting.set(key, { request, waiters: [{ resolve, reject }] });
      this.currentWorker.postMessage(request);
    });
  }

  private spawn(): Worker {
    const worker = createWorker(this.databaseDirectory);
    this.alive = true;
    worker.on('message', (reply: ProjectionReply) => this.settle(reply));
    worker.on('error', (error) => console.error(`${WORKER_ERROR_MESSAGE}: ${describeError(error)}`));
    worker.on('exit', () => {
      this.alive = false;
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
    if (requestKind === ProjectionRequestKind.Version || requestKind === ProjectionRequestKind.Blocks) return this.rejectWaiters({ key: keyOfFailure(reply), error: new Error(message) });
    this.rebuilding.delete(documentId);
    this.settleForget(documentId);
    this.inFlight.delete(documentId);
    this.rerun.delete(documentId);
    if (this.loggedProjectionFailures.has(documentId)) return;
    this.loggedProjectionFailures.add(documentId);
    console.error(`${PROJECTION_FAILED_MESSAGE} ${documentId}: ${message}`);
  }

  private settleDone(reply: ProjectionDoneReply | ServedReply): void {
    if (isServedReply(reply)) return this.resolveWaiters(reply);
    const { kind, documentId, importError } = reply;
    if (kind === ProjectionRequestKind.Forget) return this.settleForget(documentId);
    if (kind === ProjectionRequestKind.Import) this.pendingImports.delete(documentId);
    if (kind === ProjectionRequestKind.Import && this.rebuilding.has(documentId)) this.schedule(documentId);
    if (importError !== null) return this.reportImportFailure({ documentId, importError });
    if (kind !== ProjectionRequestKind.Project) return;
    this.inFlight.delete(documentId);
    if (!this.pendingImports.has(documentId)) this.rebuilding.delete(documentId);
    if (!this.rerun.delete(documentId)) return;
    this.schedule(documentId);
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
    this.pendingImports.forEach((filePath, documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Import, documentId, filePath }));
    [...this.forgetting.keys()].forEach((documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId }));
    this.waiting.forEach(({ request }) => this.currentWorker.postMessage(request));
  }

  private withinRestartBudget(): boolean {
    const now = Date.now();
    this.restartTimes.push(now);
    const recent = this.restartTimes.filter((time) => now - time < WORKER_RESTART_WINDOW_MS);
    this.restartTimes.splice(0, this.restartTimes.length, ...recent);
    return recent.length <= MAX_WORKER_RESTARTS_PER_WINDOW;
  }

  private degrade(): void {
    this.degraded = true;
    console.error(WORKER_DEGRADED_MESSAGE);
    [...this.forgetting.keys()].forEach((documentId) => this.settleForget(documentId));
    this.inFlight.clear();
    this.pendingImports.clear();
    this.rerun.clear();
    this.rebuilding.clear();
    [...this.waiting.keys()].forEach((key) => this.rejectWaiters({ key, error: new ProjectionDegradedError() }));
  }
}
