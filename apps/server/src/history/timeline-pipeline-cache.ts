import type { BandIdentity, TimelineEvent } from '@superdoc-history/history';
import type { EventAuthor } from '@superdoc-history/types';

export type TimelinePipeline = { events: TimelineEvent[]; identities: BandIdentity[]; authors: Record<string, EventAuthor>; hasTopics: boolean; unassignedBlockCount: number };

type CacheEntry = { key: string; pipeline: TimelinePipeline };

export class TimelinePipelineCache {
  builds = 0;
  private readonly entries = new Map<string, CacheEntry>();

  forget(documentId: string): void {
    this.entries.delete(documentId);
  }

  get({ documentId, key, build }: { documentId: string; key: string; build: () => TimelinePipeline }): TimelinePipeline {
    const cached = this.entries.get(documentId);
    if (cached && cached.key === key) return cached.pipeline;
    this.builds += 1;
    const pipeline = build();
    this.entries.set(documentId, { key, pipeline });
    return pipeline;
  }
}
