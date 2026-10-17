import { TopicState } from '@superdoc-history/types';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { documents } from './documents';

export const topicSets = sqliteTable('topic_sets', {
  documentId: text('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  state: text('state', { enum: [TopicState.Pending, TopicState.Ready, TopicState.Failed] }).notNull(),
  failure: text('failure'),
  computedAtSequence: integer('computed_at_sequence'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const documentTopics = sqliteTable(
  'document_topics',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [index('document_topics_by_document').on(table.documentId)],
);

export const topicBlocks = sqliteTable(
  'topic_blocks',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    blockId: text('block_id').notNull(),
    topicId: text('topic_id')
      .notNull()
      .references(() => documentTopics.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.blockId] })],
);

export const topicSummaries = sqliteTable('topic_summaries', {
  topicId: text('topic_id')
    .primaryKey()
    .references(() => documentTopics.id, { onDelete: 'cascade' }),
  sentence: text('sentence').notNull(),
  computedAtSequence: integer('computed_at_sequence').notNull(),
});

export const selectionSummaries = sqliteTable(
  'selection_summaries',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    filterKey: text('filter_key').notNull(),
    sentence: text('sentence'),
    authors: text('authors', { mode: 'json' }).$type<string[]>().notNull(),
    failure: text('failure'),
    computedAtSequence: integer('computed_at_sequence').notNull(),
    topicsUpdatedAt: integer('topics_updated_at'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.filterKey] })],
);
