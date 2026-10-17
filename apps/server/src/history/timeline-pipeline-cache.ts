import type { BandIdentity, TimelineEvent } from '@superdoc-history/history';
import { TIMELINE_PIPELINE_CACHE_SIZE, type EventAuthor } from '@superdoc-history/types';
import { LruMap } from '../limits/lru-map';

export type TimelinePipeline = {
  events: TimelineEvent[];
  identities: BandIdentity[];
  authors: Record<string, EventAuthor>;
  hasTopics: boolean;
  unassignedFirstSequences: number[];
  cursor: number | null;
};

type CacheEntry = { cacheKey: string; pipeline: TimelinePipeline };

export class TimelinePipelineCache {
  builds = 0;
  private readonly entries: LruMap<CacheEntry>;

  constructor({ maxEntries = TIMELINE_PIPELINE_CACHE_SIZE }: { maxEntries?: number } = {}) {
    this.entries = new LruMap({ isOverBudget: (entries) => entries.size > maxEntries });
  }

  forget(documentId: string): void {
    this.entries.delete(documentId);
  }

  get({ documentId, key, build }: { documentId: string; key: string; build: () => TimelinePipeline }): TimelinePipeline {
    const cached = this.entries.get(documentId);
    if (cached && cached.cacheKey === key) return cached.pipeline;
    this.builds += 1;
    const pipeline = build();
    this.entries.set({ key: documentId, value: { cacheKey: key, pipeline } });
    return pipeline;
  }
}
