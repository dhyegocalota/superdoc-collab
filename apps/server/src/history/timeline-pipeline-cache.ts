import type { BandIdentity, TimelineEvent } from '@superdoc-history/history';
import { TIMELINE_PIPELINE_CACHE_SIZE, type EventAuthor } from '@superdoc-history/types';

export type TimelinePipeline = { events: TimelineEvent[]; identities: BandIdentity[]; authors: Record<string, EventAuthor>; hasTopics: boolean; unassignedFirstSequences: number[]; cursor: number | null };

type CacheEntry = { key: string; pipeline: TimelinePipeline };

export class TimelinePipelineCache {
  builds = 0;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor({ maxEntries = TIMELINE_PIPELINE_CACHE_SIZE }: { maxEntries?: number } = {}) {
    this.maxEntries = maxEntries;
  }

  forget(documentId: string): void {
    this.entries.delete(documentId);
  }

  get({ documentId, key, build }: { documentId: string; key: string; build: () => TimelinePipeline }): TimelinePipeline {
    const cached = this.entries.get(documentId);
    if (cached && cached.key === key) {
      this.entries.delete(documentId);
      this.entries.set(documentId, cached);
      return cached.pipeline;
    }
    this.builds += 1;
    const pipeline = build();
    this.entries.delete(documentId);
    this.entries.set(documentId, { key, pipeline });
    this.trim();
    return pipeline;
  }

  private trim(): void {
    if (this.entries.size <= this.maxEntries) return;
    this.entries.delete(this.entries.keys().next().value!);
    this.trim();
  }
}
