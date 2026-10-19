import { resolveMark, type ReadModel, type ResolvedVersion, type UpdateLog, type VersionMarkSummary } from '@superdoc-collab/history';
import { VERSION_CACHE_MAX_BYTES, VERSION_CACHE_SIZE, VERSION_FAILURE_TTL_MS } from '@superdoc-collab/types';
import { KeyedCooldown } from '../limits/keyed-cooldown';
import { LruMap } from '../limits/lru-map';
import { describeError } from '../logging/describe-error';
import { ProjectionStoppedError } from './projection-messages';
import type { ProjectionScheduler } from './projection-scheduler';

const VERSION_LOAD_FAILED_MESSAGE = 'Loading a version failed for';
const VERSION_KEY_SEPARATOR = '/';
export const VERSION_MARKS_AROUND = 10;

export type VersionEndpoint = { documentId: string; sequence: number };
type LoadedVersion = { sequence: number; serverTime: number; state: Uint8Array; text: string };
type CachedLookup = { key: string; sequence: number; cached: LoadedVersion | null };

export enum VersionLookupKind {
  Ready = 'ready',
  Pending = 'pending',
  Failed = 'failed',
}

type VersionLookup =
  { kind: VersionLookupKind.Ready; version: LoadedVersion } | { kind: VersionLookupKind.Pending } | { kind: VersionLookupKind.Failed };

class VersionNotReadyError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} has no versions yet.`);
  }
}

class VersionLoadFailedError extends Error {
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

export function keysOfDocument({ keys, documentId }: { keys: Iterable<string>; documentId: string }): string[] {
  const prefix = versionKeyPrefixOf(documentId);
  return [...keys].filter((key) => key.startsWith(prefix));
}

export function marksAround({ marks, sequence }: { marks: VersionMarkSummary[]; sequence: number }): VersionMarkSummary[] {
  const centre = Math.max(
    0,
    marks.findLastIndex((mark) => mark.sequence <= sequence),
  );
  return marks.slice(Math.max(0, centre - VERSION_MARKS_AROUND), centre + VERSION_MARKS_AROUND + 1);
}

function isOverVersionBudget({
  entries,
  maxEntries,
  maxBytes,
}: {
  entries: ReadonlyMap<string, LoadedVersion>;
  maxEntries: number;
  maxBytes: number;
}): boolean {
  const bytes = [...entries.values()].reduce((total, entry) => total + entry.state.byteLength, 0);
  const isOverByteBudget = bytes > maxBytes && entries.size > 1;
  return entries.size > maxEntries || isOverByteBudget;
}

export class VersionsService {
  private readonly readModel: ReadModel;
  private readonly updateLog: UpdateLog;
  private readonly scheduler: ProjectionScheduler;
  private readonly cache: LruMap<LoadedVersion>;
  private readonly loading = new Map<string, Promise<LoadedVersion>>();
  private readonly failures = new KeyedCooldown({ durationMs: VERSION_FAILURE_TTL_MS });
  private readonly generations = new Map<string, number>();

  constructor({
    readModel,
    updateLog,
    scheduler,
    maxEntries = VERSION_CACHE_SIZE,
    maxBytes = VERSION_CACHE_MAX_BYTES,
  }: {
    readModel: ReadModel;
    updateLog: UpdateLog;
    scheduler: ProjectionScheduler;
    maxEntries?: number;
    maxBytes?: number;
  }) {
    this.readModel = readModel;
    this.updateLog = updateLog;
    this.scheduler = scheduler;
    this.cache = new LruMap({ isOverBudget: (entries) => isOverVersionBudget({ entries, maxEntries, maxBytes }) });
  }

  // NB ADR 0043: a sequence the log knows resolves to itself; only an unknown sequence clamps down to a mark.
  resolve({ documentId, sequence }: VersionEndpoint): ResolvedVersion | null {
    const serverTime = this.updateLog.serverTimeOf({ documentName: documentId, sequence });
    return resolveMark({ marks: this.readModel.marks(documentId), sequence, serverTime });
  }

  peek(endpoint: VersionEndpoint): VersionLookup {
    const lookup = this.cachedLookup(endpoint);
    if (!lookup) throw new VersionNotReadyError(endpoint.documentId);
    if (lookup.cached) return { kind: VersionLookupKind.Ready, version: lookup.cached };
    if (this.isFailedRecently(lookup.key)) return { kind: VersionLookupKind.Failed };
    this.load(endpoint).catch(() => undefined);
    return { kind: VersionLookupKind.Pending };
  }

  load(endpoint: VersionEndpoint): Promise<LoadedVersion> {
    const lookup = this.cachedLookup(endpoint);
    if (!lookup) return Promise.reject(new VersionNotReadyError(endpoint.documentId));
    if (lookup.cached) return Promise.resolve(lookup.cached);
    if (this.isFailedRecently(lookup.key)) return Promise.reject(new VersionLoadFailedError(lookup.key));
    const inFlight = this.loading.get(lookup.key);
    if (inFlight) return inFlight;
    return this.start({ key: lookup.key, documentId: endpoint.documentId, sequence: lookup.sequence });
  }

  forget(documentId: string): void {
    this.generations.set(documentId, this.generationOf(documentId) + 1);
    keysOfDocument({ keys: this.cache.keys(), documentId }).forEach((key) => this.cache.delete(key));
    keysOfDocument({ keys: this.failures.keys(), documentId }).forEach((key) => this.failures.forget(key));
    keysOfDocument({ keys: this.loading.keys(), documentId }).forEach((key) => this.loading.delete(key));
  }

  private cachedLookup(endpoint: VersionEndpoint): CachedLookup | null {
    const mark = this.resolve(endpoint);
    if (!mark) return null;
    const key = versionKeyOf({ documentId: endpoint.documentId, sequence: mark.sequence });
    return { key, sequence: mark.sequence, cached: this.cache.get(key) };
  }

  private start({ key, documentId, sequence }: { key: string; documentId: string; sequence: number }): Promise<LoadedVersion> {
    const generation = this.generationOf(documentId);
    const startedPromise: Promise<LoadedVersion> = this.scheduler
      .version({ documentId, sequence })
      .then(({ serverTime, state, text }) => this.store({ key, documentId, generation, version: { sequence, serverTime, state, text } }))
      .catch((error) => {
        this.recordFailure({ key, documentId, generation, error });
        throw error;
      })
      .finally(() => {
        if (this.loading.get(key) === startedPromise) this.loading.delete(key);
      });
    this.loading.set(key, startedPromise);
    startedPromise.catch(() => undefined);
    return startedPromise;
  }

  private generationOf(documentId: string): number {
    const generation = this.generations.get(documentId);
    if (generation === undefined) return 0;
    return generation;
  }

  hasFailedRecently(endpoint: VersionEndpoint): boolean {
    const mark = this.resolve(endpoint);
    if (!mark) return false;
    return this.isFailedRecently(versionKeyOf({ documentId: endpoint.documentId, sequence: mark.sequence }));
  }

  private isFailedRecently(key: string): boolean {
    return this.failures.remainingMs(key) > 0;
  }

  private recordFailure({
    key,
    documentId,
    generation,
    error,
  }: {
    key: string;
    documentId: string;
    generation: number;
    error: unknown;
  }): void {
    if (generation !== this.generationOf(documentId)) return;
    this.failures.start(key);
    if (error instanceof ProjectionStoppedError) return;
    console.error(`${VERSION_LOAD_FAILED_MESSAGE} ${key}: ${describeError(error)}`);
  }

  private store({
    key,
    documentId,
    generation,
    version,
  }: {
    key: string;
    documentId: string;
    generation: number;
    version: LoadedVersion;
  }): LoadedVersion {
    if (generation !== this.generationOf(documentId)) return version;
    this.cache.set({ key, value: version });
    this.failures.forget(key);
    return version;
  }
}
