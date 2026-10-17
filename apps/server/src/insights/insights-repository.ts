import type { IdentifiedTopic } from '@superdoc-history/history';
import { TopicState, type TopicStatus, type TopicSummary } from '@superdoc-history/types';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthDatabase } from '../database/connection';
import { documentTopics, topicBlocks, topicSets, topicSummaries } from '../database/schema/insights';

export type StoredTopic = { id: string; name: string; position: number; blockIds: string[] };

export class InsightsRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  status(documentId: string): TopicStatus | null {
    const row = this.database.drizzle.select().from(topicSets).where(eq(topicSets.documentId, documentId)).get();
    if (!row) return null;
    return { state: row.state, failure: row.failure, computedAtSequence: row.computedAtSequence };
  }

  updatedAt(documentId: string): number | null {
    const row = this.database.drizzle.select({ updatedAt: topicSets.updatedAt }).from(topicSets).where(eq(topicSets.documentId, documentId)).get();
    if (!row) return null;
    return row.updatedAt.getTime();
  }

  markPending(documentId: string): void {
    this.upsertState({ documentId, state: TopicState.Pending });
  }

  markFailed({ documentId, failure }: { documentId: string; failure: string }): void {
    this.upsertState({ documentId, state: TopicState.Failed, failure });
  }

  restoreStatus({ documentId, previous }: { documentId: string; previous: TopicStatus | null }): void {
    if (previous === null) {
      this.database.drizzle.delete(topicSets).where(eq(topicSets.documentId, documentId)).run();
      return;
    }
    this.database.drizzle.update(topicSets).set({ state: previous.state, failure: previous.failure, computedAtSequence: previous.computedAtSequence }).where(eq(topicSets.documentId, documentId)).run();
  }

  failInterrupted(failure: string): void {
    this.database.drizzle.update(topicSets).set({ state: TopicState.Failed, failure, updatedAt: new Date() }).where(eq(topicSets.state, TopicState.Pending)).run();
  }

  saveTopics({ documentId, topics, computedAtSequence }: { documentId: string; topics: IdentifiedTopic[]; computedAtSequence: number }): void {
    this.database.drizzle.transaction((transaction) => {
      const ownIds = new Set(transaction.select({ id: documentTopics.id }).from(documentTopics).where(eq(documentTopics.documentId, documentId)).all().map((row) => row.id));
      const resolved = topics.map((topic) => ({ ...topic, id: topic.id !== null && ownIds.has(topic.id) ? topic.id : randomUUID() }));
      const reusedIds = resolved.filter((topic) => ownIds.has(topic.id)).map((topic) => topic.id);
      transaction.delete(documentTopics).where(and(eq(documentTopics.documentId, documentId), notInArray(documentTopics.id, reusedIds))).run();
      transaction.delete(topicBlocks).where(eq(topicBlocks.documentId, documentId)).run();
      resolved.forEach((topic, position) => {
        const { id } = topic;
        transaction.insert(documentTopics).values({ id, documentId, name: topic.name, position }).onConflictDoUpdate({ target: documentTopics.id, set: { name: topic.name, position } }).run();
        topic.blockIds.forEach((blockId) => transaction.insert(topicBlocks).values({ documentId, blockId, topicId: id }).run());
      });
      transaction
        .insert(topicSets)
        .values({ documentId, state: TopicState.Ready, failure: null, computedAtSequence, updatedAt: new Date() })
        .onConflictDoUpdate({ target: topicSets.documentId, set: { state: TopicState.Ready, failure: null, computedAtSequence, updatedAt: new Date() } })
        .run();
    });
  }

  topics(documentId: string): StoredTopic[] {
    const rows = this.database.drizzle.select().from(documentTopics).where(eq(documentTopics.documentId, documentId)).orderBy(asc(documentTopics.position)).all();
    const blocks = this.database.drizzle.select().from(topicBlocks).where(eq(topicBlocks.documentId, documentId)).all();
    return rows.map((row) => ({ id: row.id, name: row.name, position: row.position, blockIds: blocks.filter((block) => block.topicId === row.id).map((block) => block.blockId) }));
  }

  summaries(documentId: string): TopicSummary[] {
    const topicIds = this.database.drizzle.select({ id: documentTopics.id }).from(documentTopics).where(eq(documentTopics.documentId, documentId)).all().map((row) => row.id);
    if (topicIds.length === 0) return [];
    return this.database.drizzle.select().from(topicSummaries).where(inArray(topicSummaries.topicId, topicIds)).all();
  }

  saveSummaries({ summaries, computedAtSequence }: { summaries: { topicId: string; sentence: string }[]; computedAtSequence: number }): void {
    this.database.drizzle.transaction((transaction) => {
      summaries.forEach(({ topicId, sentence }) =>
        transaction.insert(topicSummaries).values({ topicId, sentence, computedAtSequence }).onConflictDoUpdate({ target: topicSummaries.topicId, set: { sentence, computedAtSequence } }).run(),
      );
    });
  }

  private upsertState({ documentId, state, failure = null }: { documentId: string; state: TopicState; failure?: string | null }): void {
    const updatedAt = new Date();
    this.database.drizzle
      .insert(topicSets)
      .values({ documentId, state, failure, computedAtSequence: null, updatedAt })
      .onConflictDoUpdate({ target: topicSets.documentId, set: { state, failure, updatedAt } })
      .run();
  }
}
