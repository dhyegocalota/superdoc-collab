import { Worker } from 'node:worker_threads';
import { IMPORT_FAILED_MESSAGE, ProjectionRequestKind, type ProjectionReply } from './projection-messages';

const SOURCE_EXTENSION = '.ts';

function createWorker(databaseDirectory: string): Worker {
  const workerData = { databaseDirectory };
  if (!import.meta.url.endsWith(SOURCE_EXTENSION)) return new Worker(new URL('./projection-worker.js', import.meta.url), { workerData });
  const entry = JSON.stringify(new URL('./projection-worker.ts', import.meta.url).href);
  return new Worker(`import('tsx/esm/api').then(({ register }) => { register(); return import(${entry}); })`, { eval: true, workerData });
}

export class ProjectionScheduler {
  currentWorker: Worker;
  private readonly databaseDirectory: string;
  private readonly inFlight = new Set<string>();
  private readonly rerun = new Set<string>();
  private readonly forgetting = new Map<string, () => void>();
  private readonly loggedImportFailures = new Set<string>();
  private stopping: Promise<void> | null = null;

  constructor({ databaseDirectory }: { databaseDirectory: string }) {
    this.databaseDirectory = databaseDirectory;
    this.currentWorker = this.spawn();
  }

  schedule(documentId: string): void {
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
    return new Promise((resolve) => {
      this.forgetting.set(documentId, resolve);
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId });
    });
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = new Promise<void>((resolve) => this.currentWorker.once('exit', () => resolve()));
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
    return this.stopping;
  }

  private spawn(): Worker {
    const worker = createWorker(this.databaseDirectory);
    worker.on('message', (reply: ProjectionReply) => this.settle(reply));
    worker.on('exit', () => this.restart());
    return worker;
  }

  private settle({ kind, documentId, importError }: ProjectionReply): void {
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
    const resolve = this.forgetting.get(documentId);
    this.forgetting.delete(documentId);
    if (resolve) resolve();
  }

  private restart(): void {
    if (this.stopping) return;
    this.currentWorker = this.spawn();
    const pending = [...this.inFlight];
    this.inFlight.clear();
    pending.forEach((documentId) => this.schedule(documentId));
    [...this.forgetting.keys()].forEach((documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId }));
  }
}
