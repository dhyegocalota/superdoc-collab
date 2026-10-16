import { clampToMark, type ReadModel, type VersionMarkSummary } from '@superdoc-history/history';
import { VERSION_CACHE_MAX_BYTES, VERSION_CACHE_SIZE, VERSION_FAILURE_TTL_MS } from '@superdoc-history/types';
import { describeError } from './projection-messages';
import type { ProjectionScheduler } from './projection-scheduler';

export const VERSION_LOAD_FAILED_MESSAGE = 'Loading a version failed for';

export type VersionEndpointKey = { documentId: string; sequence: number };
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

function keyOf({ documentId, sequence }: VersionEndpointKey): string {
  return `${documentId}/${sequence}`;
}

export class VersionsService {
  private readonly readModel: ReadModel;
  private readonly scheduler: ProjectionScheduler;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly cache = new Map<string, LoadedVersion>();
  private readonly loading = new Map<string, Promise<LoadedVersion>>();
  private readonly failedAt = new Map<string, number>();

  constructor({ readModel, scheduler, maxEntries = VERSION_CACHE_SIZE, maxBytes = VERSION_CACHE_MAX_BYTES }: { readModel: ReadModel; scheduler: ProjectionScheduler; maxEntries?: number; maxBytes?: number }) {
    this.readModel = readModel;
    this.scheduler = scheduler;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  resolve({ documentId, sequence }: VersionEndpointKey): VersionMarkSummary | null {
    return clampToMark({ marks: this.readModel.marks(documentId), sequence });
  }

  peek(endpoint: VersionEndpointKey): VersionLookup {
    const mark = this.resolve(endpoint);
    if (!mark) throw new VersionNotReadyError(endpoint.documentId);
    const key = keyOf({ documentId: endpoint.documentId, sequence: mark.sequence });
    const cached = this.touch(key);
    if (cached) return { kind: VersionLookupKind.Ready, version: cached };
    const failedAt = this.failedAt.get(key);
    if (failedAt !== undefined && Date.now() - failedAt < VERSION_FAILURE_TTL_MS) return { kind: VersionLookupKind.Failed };
    this.load(endpoint).catch((error) => console.error(`${VERSION_LOAD_FAILED_MESSAGE} ${key}: ${describeError(error)}`));
    return { kind: VersionLookupKind.Pending };
  }

  load(endpoint: VersionEndpointKey): Promise<LoadedVersion> {
    const mark = this.resolve(endpoint);
    if (!mark) return Promise.reject(new VersionNotReadyError(endpoint.documentId));
    const key = keyOf({ documentId: endpoint.documentId, sequence: mark.sequence });
    const cached = this.touch(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.loading.get(key);
    if (inFlight) return inFlight;
    const started = this.scheduler
      .version({ documentId: endpoint.documentId, sequence: mark.sequence })
      .then(({ sequence, serverTime, state, text }) => this.store({ key, version: { sequence, serverTime, state, text } }))
      .catch((error) => {
        this.failedAt.set(key, Date.now());
        throw error;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, started);
    return started;
  }

  forget(documentId: string): void {
    const prefix = `${documentId}/`;
    [this.cache, this.failedAt].forEach((entries) => [...entries.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => entries.delete(key)));
  }

  private touch(key: string): LoadedVersion | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached;
  }

  private store({ key, version }: { key: string; version: LoadedVersion }): LoadedVersion {
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
