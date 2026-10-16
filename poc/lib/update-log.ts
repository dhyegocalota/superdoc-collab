import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';

export type LoggedUpdate = {
  sequence: number;
  documentName: string;
  connectionUserId: string;
  yjsClientIds: number[];
  serverTime: number;
  update: Uint8Array;
};

export enum IdentitySource {
  Observed = 'observed',
  Declared = 'declared',
}

export type ClientIdentity = {
  documentName: string;
  yjsClientId: number;
  userId: string;
};

type UpdateRow = {
  sequence: number;
  document_name: string;
  connection_user_id: string;
  yjs_client_ids: string;
  server_time: number;
  update_bytes: Uint8Array;
};

export function extractStructClientIds(update: Uint8Array): number[] {
  const { structs } = Y.decodeUpdate(update);
  return [...new Set(structs.map((struct) => struct.id.client))].sort((left, right) => left - right);
}

export class UpdateLog {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS updates (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        document_name TEXT NOT NULL,
        connection_user_id TEXT NOT NULL,
        yjs_client_ids TEXT NOT NULL,
        server_time INTEGER NOT NULL,
        update_bytes BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS updates_by_document ON updates (document_name, sequence);
      CREATE TABLE IF NOT EXISTS snapshots (
        document_name TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        state BLOB NOT NULL,
        PRIMARY KEY (document_name, sequence)
      );
      CREATE TABLE IF NOT EXISTS client_identities (
        document_name TEXT NOT NULL,
        yjs_client_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        PRIMARY KEY (document_name, yjs_client_id)
      );
    `);
  }

  append({ documentName, connectionUserId, update }: { documentName: string; connectionUserId: string; update: Uint8Array }): LoggedUpdate {
    const yjsClientIds = extractStructClientIds(update);
    const serverTime = Date.now();
    yjsClientIds.forEach((yjsClientId) => this.observeClientIdentity({ documentName, yjsClientId, userId: connectionUserId }));
    const result = this.database
      .prepare(
        'INSERT INTO updates (document_name, connection_user_id, yjs_client_ids, server_time, update_bytes) VALUES (?, ?, ?, ?, ?)',
      )
      .run(documentName, connectionUserId, JSON.stringify(yjsClientIds), serverTime, update);
    return { sequence: Number(result.lastInsertRowid), documentName, connectionUserId, yjsClientIds, serverTime, update };
  }

  observeClientIdentity({ documentName, yjsClientId, userId }: ClientIdentity): void {
    this.database
      .prepare('INSERT OR IGNORE INTO client_identities (document_name, yjs_client_id, user_id, source) VALUES (?, ?, ?, ?)')
      .run(documentName, yjsClientId, userId, IdentitySource.Observed);
  }

  declareClientIdentity({ documentName, yjsClientId, userId }: ClientIdentity): void {
    this.database
      .prepare(
        `INSERT INTO client_identities (document_name, yjs_client_id, user_id, source) VALUES (?, ?, ?, ?)
         ON CONFLICT (document_name, yjs_client_id) DO UPDATE SET user_id = excluded.user_id, source = excluded.source
         WHERE client_identities.source = ?`,
      )
      .run(documentName, yjsClientId, userId, IdentitySource.Declared, IdentitySource.Observed);
  }

  identitySources(documentName: string): Map<number, IdentitySource> {
    const rows = this.database
      .prepare('SELECT yjs_client_id, source FROM client_identities WHERE document_name = ?')
      .all(documentName) as { yjs_client_id: number; source: IdentitySource }[];
    return new Map(rows.map((row) => [row.yjs_client_id, row.source]));
  }

  clientIdentities(documentName: string): Map<number, string> {
    const rows = this.database
      .prepare('SELECT yjs_client_id, user_id FROM client_identities WHERE document_name = ?')
      .all(documentName) as { yjs_client_id: number; user_id: string }[];
    return new Map(rows.map((row) => [row.yjs_client_id, row.user_id]));
  }

  read({ documentName, untilSequence }: { documentName: string; untilSequence: number }): LoggedUpdate[] {
    return this.readRange({ documentName, afterSequence: 0, untilSequence });
  }

  readRange({ documentName, afterSequence, untilSequence }: { documentName: string; afterSequence: number; untilSequence: number }): LoggedUpdate[] {
    const rows = this.database
      .prepare('SELECT * FROM updates WHERE document_name = ? AND sequence > ? AND sequence <= ? ORDER BY sequence')
      .all(documentName, afterSequence, untilSequence) as UpdateRow[];
    return rows.map((row) => ({
      sequence: row.sequence,
      documentName: row.document_name,
      connectionUserId: row.connection_user_id,
      yjsClientIds: JSON.parse(row.yjs_client_ids),
      serverTime: row.server_time,
      update: new Uint8Array(row.update_bytes),
    }));
  }

  writeSnapshot({ documentName, sequence, state }: { documentName: string; sequence: number; state: Uint8Array }): void {
    this.database.prepare('INSERT OR IGNORE INTO snapshots (document_name, sequence, state) VALUES (?, ?, ?)').run(documentName, sequence, state);
  }

  latestSnapshot({ documentName, atOrBefore }: { documentName: string; atOrBefore: number }): Snapshot | null {
    const row = this.database
      .prepare('SELECT sequence, state FROM snapshots WHERE document_name = ? AND sequence <= ? ORDER BY sequence DESC LIMIT 1')
      .get(documentName, atOrBefore) as { sequence: number; state: Uint8Array } | undefined;
    if (!row) return null;
    return { sequence: row.sequence, state: new Uint8Array(row.state) };
  }

  close(): void {
    this.database.close();
  }
}

export type Snapshot = {
  sequence: number;
  state: Uint8Array;
};

export function materialize({ log, documentName, untilSequence }: { log: UpdateLog; documentName: string; untilSequence: number }): Y.Doc {
  const document = new Y.Doc();
  const snapshot = log.latestSnapshot({ documentName, atOrBefore: untilSequence });
  if (snapshot) Y.applyUpdate(document, snapshot.state);
  const tail = log.readRange({ documentName, afterSequence: snapshot ? snapshot.sequence : 0, untilSequence });
  if (tail.length > 0) Y.applyUpdate(document, Y.mergeUpdates(tail.map((logged) => logged.update)));
  return document;
}

export function compact({ log, documentName, everyUpdates }: { log: UpdateLog; documentName: string; everyUpdates: number }): number[] {
  const updates = log.read({ documentName, untilSequence: Number.MAX_SAFE_INTEGER });
  const boundaries = updates.filter((_, index) => (index + 1) % everyUpdates === 0).map((update) => update.sequence);
  const missing = boundaries.filter((sequence) => log.latestSnapshot({ documentName, atOrBefore: sequence })?.sequence !== sequence);
  missing.forEach((sequence) => {
    const state = Y.encodeStateAsUpdate(materialize({ log, documentName, untilSequence: sequence }));
    log.writeSnapshot({ documentName, sequence, state });
  });
  return missing;
}

export function replay(updates: LoggedUpdate[]): Y.Doc {
  const document = new Y.Doc();
  Y.applyUpdate(document, Y.mergeUpdates(updates.map((logged) => logged.update)));
  return document;
}
