import type Database from 'better-sqlite3';
import { BlockChangeKind } from '@superdoc-history/types';
import type { ProjectedEdit } from './edit-events';

const IMPORTED_SEQUENCE = 0;
const ALL_SEQUENCES = IMPORTED_SEQUENCE - 1;
const IMPORTED_KEY_PREFIX = 'imported';
const READ_MODEL_TABLES = ['edit_events', 'projection_cursor'];
const INSERT_EVENT = `INSERT OR IGNORE INTO edit_events (document_name, event_key, sequence, server_time, yjs_client_ids, connection_user_id, author_name, block_id, kind, inserted, deleted, imported)
  VALUES (@documentName, @eventKey, @sequence, @serverTime, @yjsClientIds, @connectionUserId, @authorName, @blockId, @kind, @inserted, @deleted, @imported)`;

export type StoredEditEvent = Omit<ProjectedEdit, 'yjsClientIds' | 'connectionUserId'> & { id: number; imported: boolean; yjsClientIds: number[] | null; connectionUserId: string | null; authorName: string | null };
export type ImportedRevision = { revisionId: string; authorName: string; serverTime: number; blockId: string; inserted: string; deleted: string };
type EventRow = { id: number; sequence: number; server_time: number; yjs_client_ids: string | null; connection_user_id: string | null; author_name: string | null; block_id: string; kind: BlockChangeKind; inserted: string; deleted: string; imported: number };

function toStoredEvent(row: EventRow): StoredEditEvent {
  return { id: row.id, sequence: row.sequence, serverTime: row.server_time, yjsClientIds: row.yjs_client_ids === null ? null : JSON.parse(row.yjs_client_ids), connectionUserId: row.connection_user_id, authorName: row.author_name, blockId: row.block_id, kind: row.kind, inserted: row.inserted, deleted: row.deleted, imported: row.imported === 1 };
}

export class ReadModel {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  cursor(documentName: string): number | null {
    const row = this.database.prepare('SELECT last_sequence FROM projection_cursor WHERE document_name = ?').get(documentName) as { last_sequence: number } | undefined;
    if (!row) return null;
    return row.last_sequence;
  }

  commit({ documentName, events, lastSequence }: { documentName: string; events: ProjectedEdit[]; lastSequence: number }): void {
    const insert = this.database.prepare(INSERT_EVENT);
    const advance = this.database.prepare('INSERT INTO projection_cursor (document_name, last_sequence) VALUES (?, ?) ON CONFLICT (document_name) DO UPDATE SET last_sequence = excluded.last_sequence');
    this.database.transaction(() => {
      events.forEach((event) => insert.run({ documentName, eventKey: `${event.sequence}:${event.blockId}:${event.kind}`, sequence: event.sequence, serverTime: event.serverTime, yjsClientIds: JSON.stringify(event.yjsClientIds), connectionUserId: event.connectionUserId, authorName: null, blockId: event.blockId, kind: event.kind, inserted: event.inserted, deleted: event.deleted, imported: 0 }));
      advance.run(documentName, lastSequence);
    })();
  }

  commitImported({ documentName, revisions }: { documentName: string; revisions: ImportedRevision[] }): void {
    const insert = this.database.prepare(INSERT_EVENT);
    this.database.transaction(() => revisions.forEach((revision) => insert.run({ documentName, eventKey: `${IMPORTED_KEY_PREFIX}:${revision.revisionId}`, sequence: IMPORTED_SEQUENCE, serverTime: revision.serverTime, yjsClientIds: null, connectionUserId: null, authorName: revision.authorName, blockId: revision.blockId, kind: BlockChangeKind.Modified, inserted: revision.inserted, deleted: revision.deleted, imported: 1 })))();
  }

  read({ documentName, afterSequence }: { documentName: string; afterSequence: number | null }): StoredEditEvent[] {
    const lowerBound = afterSequence === null ? ALL_SEQUENCES : afterSequence;
    const rows = this.database.prepare('SELECT * FROM edit_events WHERE document_name = ? AND sequence > ? ORDER BY sequence, id').all(documentName, lowerBound) as EventRow[];
    return rows.map(toStoredEvent);
  }

  forget(documentName: string): void {
    this.database.transaction(() => READ_MODEL_TABLES.forEach((table) => this.database.prepare(`DELETE FROM ${table} WHERE document_name = ?`).run(documentName)))();
  }
}
