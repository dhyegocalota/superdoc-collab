import { blob, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const updates = sqliteTable(
  'updates',
  {
    sequence: integer('sequence').primaryKey({ autoIncrement: true }),
    documentName: text('document_name').notNull(),
    connectionUserId: text('connection_user_id').notNull(),
    yjsClientIds: text('yjs_client_ids').notNull(),
    serverTime: integer('server_time').notNull(),
    updateBytes: blob('update_bytes').notNull(),
  },
  (table) => [index('updates_by_document').on(table.documentName, table.sequence)],
);

export const snapshots = sqliteTable(
  'snapshots',
  {
    documentName: text('document_name').notNull(),
    sequence: integer('sequence').notNull(),
    state: blob('state').notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentName, table.sequence] })],
);

export const clientIdentities = sqliteTable(
  'client_identities',
  {
    documentName: text('document_name').notNull(),
    yjsClientId: integer('yjs_client_id').notNull(),
    userId: text('user_id').notNull(),
    source: text('source').notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentName, table.yjsClientId] })],
);
