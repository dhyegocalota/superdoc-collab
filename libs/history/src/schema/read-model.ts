import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const editEvents = sqliteTable(
  'edit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    documentName: text('document_name').notNull(),
    eventKey: text('event_key').notNull(),
    sequence: integer('sequence').notNull(),
    serverTime: integer('server_time').notNull(),
    yjsClientIds: text('yjs_client_ids'),
    connectionUserId: text('connection_user_id'),
    authorName: text('author_name'),
    blockId: text('block_id').notNull(),
    kind: text('kind').notNull(),
    inserted: text('inserted').notNull(),
    deleted: text('deleted').notNull(),
    imported: integer('imported', { mode: 'boolean' }).notNull(),
  },
  (table) => [
    index('edit_events_by_document').on(table.documentName, table.sequence),
    uniqueIndex('edit_events_by_key').on(table.documentName, table.eventKey),
  ],
);

export const projectionCursor = sqliteTable('projection_cursor', {
  documentName: text('document_name').primaryKey(),
  lastSequence: integer('last_sequence').notNull(),
});

export const versionMarks = sqliteTable(
  'version_marks',
  {
    documentName: text('document_name').notNull(),
    sequence: integer('sequence').notNull(),
    serverTime: integer('server_time').notNull(),
    minuteStart: integer('minute_start').notNull(),
    isBootstrap: integer('is_bootstrap', { mode: 'boolean' }).notNull(),
    snapshot: blob('snapshot').notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentName, table.sequence] }), index('version_marks_by_minute').on(table.documentName, table.minuteStart)],
);
