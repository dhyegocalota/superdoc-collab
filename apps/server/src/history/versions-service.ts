import { clampToMark, type ReadModel, type VersionMarkSummary } from '@superdoc-history/history';
import { VERSION_CACHE_MAX_BYTES, VERSION_CACHE_SIZE, VERSION_FAILURE_TTL_MS } from '@superdoc-history/types';
import { describeError, ProjectionStoppedError } from './projection-messages';
import type { ProjectionScheduler } from './projection-scheduler';

export const VERSION_LOAD_FAILED_MESSAGE = 'Loading a version failed for';
export const VERSION_KEY_SEPARATOR = '/';

export type VersionEndpoint = { documentId: string; sequence: number };
export type LoadedVersion = { sequence: number; serverTime: number; state: Uint8Array; text: string };

export enum VersionLookupKind {
  Ready = 'ready',
  Pending = 'pending',
  Failed = 'failed',
}

export type VersionLookup = { kind: VersionLookupKind.Ready; version: LoadedVersion } | { kind: VersionLookupKind.Pending } | { kind: VersionLookupKind.Failed };

export class VersionNotReadyError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} has no versions yet.`);
  }
}

export class VersionLoadFailedError extends Error {
  constructor(key: string) {
    super(`Version ${key} failed to load recently.`);
  }
}

export function versionKeyOf({ documentId, sequence }: VersionEndpoint): string {
  return `${documentId}${VERSION_KEY_SEPARATOR}${sequence}`;
}

export function versionKeyPrefixOf(documentId: string): string {
  return `${documentId}${VERSION_KEY_SEPARATOR}`;
}

export class VersionsService {
  private readonly readModel: ReadModel;
  private readonly scheduler: ProjectionScheduler;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly cache = new Map<string, LoadedVersion>();
  private readonly loading = new Map<string, Promise<LoadedVersion>>();
  private readonly failedAt = new Map<string, number>();
  private readonly generations = new Map<string, number>();

  constructor({ readModel, scheduler, maxEntries = VERSION_CACHE_SIZE, maxBytes = VERSION_CACHE_MAX_BYTES }: { readModel: ReadModel; scheduler: ProjectionScheduler; maxEntries?: number; maxBytes?: number }) {
    this.readModel = readModel;
    this.scheduler = scheduler;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  resolve({ documentId, sequence }: VersionEndpoint): VersionMarkSummary | null {
    return clampToMark({ marks: this.readModel.marks(documentId), sequence });
  }

  peek(endpoint: VersionEndpoint): VersionLookup {
    const mark = this.resolve(endpoint);
    if (!mark) throw new VersionNotReadyError(endpoint.documentId);
    const key = versionKeyOf({ documentId: endpoint.documentId, sequence: mark.sequence });
    const cached = this.touch(key);
    if (cached) return { kind: VersionLookupKind.Ready, version: cached };
    if (this.isFailedRecently(key)) return { kind: VersionLookupKind.Failed };
    this.load(endpoint).catch(() => undefined);
    return { kind: VersionLookupKind.Pending };
  }

  load(endpoint: VersionEndpoint): Promise<LoadedVersion> {
    const mark = this.resolve(endpoint);
    if (!mark) return Promise.reject(new VersionNotReadyError(endpoint.documentId));
    const key = versionKeyOf({ documentId: endpoint.documentId, sequence: mark.sequence });
    const cached = this.touch(key);
    if (cached) return Promise.resolve(cached);
    if (this.isFailedRecently(key)) return Promise.reject(new VersionLoadFailedError(key));
    const inFlight = this.loading.get(key);
    if (inFlight) return inFlight;
    return this.start({ key, documentId: endpoint.documentId, sequence: mark.sequence });
  }

  forget(documentId: string): void {
    const prefix = versionKeyPrefixOf(documentId);
    this.generations.set(documentId, this.generationOf(documentId) + 1);
    [this.cache, this.failedAt, this.loading].forEach((entries) => [...entries.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => entries.delete(key)));
  }

  private start({ key, documentId, sequence }: { key: string; documentId: string; sequence: number }): Promise<LoadedVersion> {
    const generation = this.generationOf(documentId);
    const started: Promise<LoadedVersion> = this.scheduler
      .version({ documentId, sequence })
      .then(({ serverTime, state, text }) => this.store({ key, documentId, generation, version: { sequence, serverTime, state, text } }))
      .catch((error) => {
        this.recordFailure({ key, documentId, generation, error });
        throw error;
      })
      .finally(() => {
        if (this.loading.get(key) === started) this.loading.delete(key);
      });
    this.loading.set(key, started);
    started.catch(() => undefined);
    return started;
  }

  private generationOf(documentId: string): number {
    const generation = this.generations.get(documentId);
    if (generation === undefined) return 0;
    return generation;
  }

  private isFailedRecently(key: string): boolean {
    const failedAt = this.failedAt.get(key);
    if (failedAt === undefined) return false;
    if (Date.now() - failedAt < VERSION_FAILURE_TTL_MS) return true;
    this.failedAt.delete(key);
    return false;
  }

  private recordFailure({ key, documentId, generation, error }: { key: string; documentId: string; generation: number; error: unknown }): void {
    if (generation !== this.generationOf(documentId)) return;
    this.failedAt.set(key, Date.now());
    if (error instanceof ProjectionStoppedError) return;
    console.error(`${VERSION_LOAD_FAILED_MESSAGE} ${key}: ${describeError(error)}`);
  }

  private touch(key: string): LoadedVersion | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached;
  }

  private store({ key, documentId, generation, version }: { key: string; documentId: string; generation: number; version: LoadedVersion }): LoadedVersion {
    if (generation !== this.generationOf(documentId)) return version;
    this.cache.set(key, version);
    this.failedAt.delete(key);
    this.trim();
    return version;
  }

  private trim(): void {
    const bytes = [...this.cache.values()].reduce((total, entry) => total + entry.state.byteLength, 0);
    const isOverBudget = this.cache.size > this.maxEntries || (bytes > this.maxBytes && this.cache.size > 1);
    if (!isOverBudget) return;
    this.cache.delete(this.cache.keys().next().value!);
    this.trim();
  }
}
