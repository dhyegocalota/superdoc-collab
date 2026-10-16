import { Worker } from 'node:worker_threads';
import { IMPORT_FAILED_MESSAGE, PROJECTION_FAILED_MESSAGE, ProjectionReplyKind, ProjectionRequestKind, type ProjectionDoneReply, type ProjectionReply } from './projection-messages';

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

export class ProjectionScheduler {
  currentWorker: Worker;
  private readonly databaseDirectory: string;
  private readonly inFlight = new Set<string>();
  private readonly rerun = new Set<string>();
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
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Import, documentId, filePath });
  }

  forget(documentId: string): Promise<void> {
    if (this.degraded) return Promise.resolve();
    return new Promise((resolve) => {
      this.forgetting.set(documentId, [...(this.forgetting.get(documentId) || []), resolve]);
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

  private spawn(): Worker {
    const worker = createWorker(this.databaseDirectory);
    this.alive = true;
    worker.on('message', (reply: ProjectionReply) => this.settle(reply));
    worker.on('error', (error) => console.error(`${WORKER_ERROR_MESSAGE}: ${String(error).replaceAll('\n', ' ')}`));
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

  private settleFailure({ documentId, message }: { documentId: string; message: string }): void {
    this.settleForget(documentId);
    this.inFlight.delete(documentId);
    this.rerun.delete(documentId);
    if (this.loggedProjectionFailures.has(documentId)) return;
    this.loggedProjectionFailures.add(documentId);
    console.error(`${PROJECTION_FAILED_MESSAGE} ${documentId}: ${message}`);
  }

  private settleDone({ kind, documentId, importError }: ProjectionDoneReply): void {
    if (kind === ProjectionRequestKind.Forget) return this.settleForget(documentId);
    if (importError !== null) return this.reportImportFailure({ documentId, importError });
    if (kind !== ProjectionRequestKind.Project) return;
    this.inFlight.delete(documentId);
    if (!this.rerun.delete(documentId)) return;
    this.schedule(documentId);
  }

  private reportImportFailure({ documentId, importError }: { documentId: string; importError: string }): void {
    if (this.loggedImportFailures.has(documentId)) return;
    this.loggedImportFailures.add(documentId);
    console.error(`${IMPORT_FAILED_MESSAGE} ${documentId}: ${importError}`);
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
    [...this.forgetting.keys()].forEach((documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId }));
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
    this.rerun.clear();
  }
}
