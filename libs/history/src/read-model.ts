import type Database from 'better-sqlite3';
import { BlockChangeKind, ClientActor } from '@superdoc-collab/types';
import type { ProjectedEdit } from './edit-events';
import type { VersionMark, VersionMarkSummary } from './version-marks';

const IMPORTED_SEQUENCE = 0;
export const ALL_SEQUENCES = IMPORTED_SEQUENCE - 1;
const IMPORTED_KEY_PREFIX = 'imported';
const READ_MODEL_TABLES = ['edit_events', 'projection_cursor', 'version_marks'];
const INSERT_EVENT = `INSERT OR IGNORE INTO edit_events (document_name, event_key, sequence, server_time, yjs_client_ids, connection_user_id, connection_actor, author_name, block_id, kind, inserted, deleted, imported)
  VALUES (@documentName, @eventKey, @sequence, @serverTime, @yjsClientIds, @connectionUserId, @connectionActor, @authorName, @blockId, @kind, @inserted, @deleted, @imported)`;

const PRUNE_MINUTE = 'DELETE FROM version_marks WHERE document_name = ? AND minute_start = ? AND sequence < ? AND is_bootstrap = 0';
const INSERT_MARK = `INSERT OR IGNORE INTO version_marks (document_name, sequence, server_time, minute_start, is_bootstrap, snapshot)
  VALUES (@documentName, @sequence, @serverTime, @minuteStart, @isBootstrap, @snapshot)`;
const MARK_SUMMARY_COLUMNS = 'sequence, server_time AS serverTime, minute_start AS minuteStart, is_bootstrap AS isBootstrap';

export type StoredEditEvent = Omit<ProjectedEdit, 'yjsClientIds' | 'connectionUserId'> & {
  id: number;
  imported: boolean;
  yjsClientIds: number[] | null;
  connectionUserId: string | null;
  authorName: string | null;
};
export type ImportedRevision = {
  revisionId: string;
  authorName: string;
  serverTime: number;
  blockId: string;
  inserted: string;
  deleted: string;
};
type EventRow = {
  id: number;
  sequence: number;
  server_time: number;
  yjs_client_ids: string | null;
  connection_user_id: string | null;
  connection_actor: ClientActor;
  author_name: string | null;
  block_id: string;
  kind: BlockChangeKind;
  inserted: string;
  deleted: string;
  imported: number;
};

function toStoredEvent(row: EventRow): StoredEditEvent {
  return {
    id: row.id,
    sequence: row.sequence,
    serverTime: row.server_time,
    yjsClientIds: row.yjs_client_ids === null ? null : JSON.parse(row.yjs_client_ids),
    connectionUserId: row.connection_user_id,
    connectionActor: row.connection_actor,
    authorName: row.author_name,
    blockId: row.block_id,
    kind: row.kind,
    inserted: row.inserted,
    deleted: row.deleted,
    imported: row.imported === 1,
  };
}

export class ReadModel {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  cursor(documentName: string): number | null {
    const row = this.database.prepare('SELECT last_sequence FROM projection_cursor WHERE document_name = ?').get(documentName) as
      { last_sequence: number } | undefined;
    if (!row) return null;
    return row.last_sequence;
  }

  readWithCursor({ documentName, afterSequence }: { documentName: string; afterSequence: number | null }): {
    events: StoredEditEvent[];
    cursor: number | null;
  } {
    return this.database.transaction(() => ({ cursor: this.cursor(documentName), events: this.read({ documentName, afterSequence }) }))();
  }

  commit({
    documentName,
    events,
    marks,
    lastSequence,
  }: {
    documentName: string;
    events: ProjectedEdit[];
    marks: VersionMark[];
    lastSequence: number;
    preview?: string;
  }): void {
    const insert = this.database.prepare(INSERT_EVENT);
    const pruneMinute = this.database.prepare(PRUNE_MINUTE);
    const insertMark = this.database.prepare(INSERT_MARK);
    const advance = this.database.prepare(
      'INSERT INTO projection_cursor (document_name, last_sequence) VALUES (?, ?) ON CONFLICT (document_name) DO UPDATE SET last_sequence = excluded.last_sequence',
    );
    this.database.transaction(() => {
      events.forEach((event) =>
        insert.run({
          documentName,
          eventKey: `${event.sequence}:${event.blockId}:${event.kind}`,
          sequence: event.sequence,
          serverTime: event.serverTime,
          yjsClientIds: JSON.stringify(event.yjsClientIds),
          connectionUserId: event.connectionUserId,
          connectionActor: event.connectionActor,
          authorName: null,
          blockId: event.blockId,
          kind: event.kind,
          inserted: event.inserted,
          deleted: event.deleted,
          imported: 0,
        }),
      );
      marks.forEach((mark) => {
        pruneMinute.run(documentName, mark.minuteStart, mark.sequence);
        insertMark.run({ documentName, ...mark, isBootstrap: mark.isBootstrap ? 1 : 0 });
      });
      advance.run(documentName, lastSequence);
    })();
  }

  previews(documentNames: string[]): Map<string, string> {
    throw new Error('ReadModel.previews is not implemented');
  }

  commitImported({ documentName, revisions }: { documentName: string; revisions: ImportedRevision[] }): void {
    const insert = this.database.prepare(INSERT_EVENT);
    this.database.transaction(() =>
      revisions.forEach((revision) =>
        insert.run({
          documentName,
          eventKey: `${IMPORTED_KEY_PREFIX}:${revision.revisionId}`,
          sequence: IMPORTED_SEQUENCE,
          serverTime: revision.serverTime,
          yjsClientIds: null,
          connectionUserId: null,
          connectionActor: ClientActor.Human,
          authorName: revision.authorName,
          blockId: revision.blockId,
          kind: BlockChangeKind.Modified,
          inserted: revision.inserted,
          deleted: revision.deleted,
          imported: 1,
        }),
      ),
    )();
  }

  read({ documentName, afterSequence }: { documentName: string; afterSequence: number | null }): StoredEditEvent[] {
    const lowerBound = afterSequence === null ? ALL_SEQUENCES : afterSequence;
    const rows = this.database
      .prepare('SELECT * FROM edit_events WHERE document_name = ? AND sequence > ? ORDER BY sequence, id')
      .all(documentName, lowerBound) as EventRow[];
    return rows.map(toStoredEvent);
  }

  readPage({ documentName, afterSequence, limit }: { documentName: string; afterSequence: number | null; limit: number }): {
    events: StoredEditEvent[];
    cursor: number | null;
    nextAfterSequence: number | null;
  } {
    return this.database.transaction(() => {
      const lowerBound = afterSequence === null ? ALL_SEQUENCES : afterSequence;
      const cursor = this.cursor(documentName);
      const boundaryRow = this.database
        .prepare('SELECT sequence FROM edit_events WHERE document_name = ? AND sequence > ? ORDER BY sequence, id LIMIT 1 OFFSET ?')
        .get(documentName, lowerBound, limit - 1) as { sequence: number } | undefined;
      if (!boundaryRow) return { cursor, events: this.read({ documentName, afterSequence }), nextAfterSequence: null };
      const boundary = boundaryRow.sequence;
      const rows = this.database
        .prepare('SELECT * FROM edit_events WHERE document_name = ? AND sequence > ? AND sequence <= ? ORDER BY sequence, id')
        .all(documentName, lowerBound, boundary) as EventRow[];
      const hasMore =
        this.database.prepare('SELECT 1 FROM edit_events WHERE document_name = ? AND sequence > ? LIMIT 1').get(documentName, boundary) !==
        undefined;
      return { cursor, events: rows.map(toStoredEvent), nextAfterSequence: hasMore ? boundary : null };
    })();
  }

  marks(documentName: string): VersionMarkSummary[] {
    const rows = this.database
      .prepare(`SELECT ${MARK_SUMMARY_COLUMNS} FROM version_marks WHERE document_name = ? ORDER BY sequence`)
      .all(documentName) as (Omit<VersionMarkSummary, 'isBootstrap'> & { isBootstrap: number })[];
    return rows.map((row) => ({ ...row, isBootstrap: row.isBootstrap === 1 }));
  }

  mark({ documentName, sequence }: { documentName: string; sequence: number }): VersionMark | null {
    const row = this.database
      .prepare(`SELECT ${MARK_SUMMARY_COLUMNS}, snapshot FROM version_marks WHERE document_name = ? AND sequence = ?`)
      .get(documentName, sequence) as
      (Omit<VersionMark, 'isBootstrap' | 'snapshot'> & { isBootstrap: number; snapshot: Uint8Array }) | undefined;
    if (!row) return null;
    return { ...row, isBootstrap: row.isBootstrap === 1, snapshot: new Uint8Array(row.snapshot) };
  }

  forget(documentName: string): void {
    this.database.transaction(() =>
      READ_MODEL_TABLES.forEach((table) => this.database.prepare(`DELETE FROM ${table} WHERE document_name = ?`).run(documentName)),
    )();
  }
}
