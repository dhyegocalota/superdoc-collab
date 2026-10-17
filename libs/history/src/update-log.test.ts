import { AgentActionKind, ClientActor } from '@superdoc-collab/types';
import Database from 'better-sqlite3';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentActionsLog } from './agent-actions';
import { MigrationSet, runMigrationSet } from './migrations';
import { openTestDatabase, temporaryDatabasePath } from './testing';
import { UpdateLog, compact } from './update-log';

const DOCUMENT = 'document-1';
const OTHER_DOCUMENT = 'other';

function typedUpdates(count: number): Uint8Array[] {
  const document = new Y.Doc();
  const captured: Uint8Array[] = [];
  document.on('update', (update: Uint8Array) => captured.push(update));
  Array.from({ length: count }).forEach((_, index) => document.getText('t').insert(index, 'a'));
  return captured;
}

function logWith(count: number): UpdateLog {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  typedUpdates(count).forEach((update) =>
    log.append({ documentName: DOCUMENT, connectionUserId: 'ana', connectionActor: ClientActor.Human, update }),
  );
  return log;
}

test('binds a Uint8Array as is and stores identical bytes', () => {
  const sqlite = openTestDatabase({ set: MigrationSet.History });
  const [input] = typedUpdates(1);
  new UpdateLog(sqlite).append({ documentName: DOCUMENT, connectionUserId: 'ana', connectionActor: ClientActor.Human, update: input! });
  const row = sqlite.prepare('SELECT update_bytes FROM updates').get() as { update_bytes: Uint8Array };
  expect(new Uint8Array(row.update_bytes)).toEqual(input);
});

test('compaction reads only the tail after the latest snapshot', () => {
  const log = logWith(25);
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: 10 })).toEqual([10, 20]);
  typedUpdates(5).forEach((update) =>
    log.append({ documentName: DOCUMENT, connectionUserId: 'ana', connectionActor: ClientActor.Human, update }),
  );
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: 10 })).toEqual([30]);
});

test('readBatch returns the next sequences after a cursor', () => {
  const batch = logWith(5).readBatch({ documentName: DOCUMENT, afterSequence: 1, limit: 2 });
  expect(batch.map((update) => update.sequence)).toEqual([2, 3]);
});

test('forget removes one document and keeps the others', () => {
  const log = logWith(3);
  typedUpdates(1).forEach((update) =>
    log.append({ documentName: OTHER_DOCUMENT, connectionUserId: 'bruno', connectionActor: ClientActor.Human, update }),
  );
  log.forget(DOCUMENT);
  expect(log.hasUpdates(DOCUMENT)).toBe(false);
  expect(log.clientIdentities(DOCUMENT).size).toBe(0);
  expect(log.hasUpdates(OTHER_DOCUMENT)).toBe(true);
});

test('append stores the connection actor and observes identities with it', () => {
  const sqlite = openTestDatabase({ set: MigrationSet.History });
  const log = new UpdateLog(sqlite);
  const [input] = typedUpdates(1);
  const logged = log.append({ documentName: DOCUMENT, connectionUserId: 'ana', connectionActor: ClientActor.Agent, update: input! });
  const [stored] = log.read({ documentName: DOCUMENT, untilSequence: logged.sequence });
  const identity = sqlite.prepare('SELECT actor FROM client_identities').get() as { actor: ClientActor };
  expect([logged.connectionActor, stored!.connectionActor, identity.actor]).toEqual([
    ClientActor.Agent,
    ClientActor.Agent,
    ClientActor.Agent,
  ]);
});

const HISTORY_MIGRATIONS = fileURLToPath(new URL('../drizzle/history', import.meta.url));
const FIRST_MIGRATION_COUNT = 1;

function folderWithFirstMigrationOnly(): string {
  const folder = join(mkdtempSync(join(tmpdir(), 'superdoc-history-first-')), 'history');
  cpSync(HISTORY_MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, FIRST_MIGRATION_COUNT) }));
  return folder;
}

test('rows logged before the actor migration read as human', () => {
  const path = temporaryDatabasePath(MigrationSet.History);
  const legacy = new Database(path);
  runMigrationSet({ sqlite: legacy, migrationsFolder: folderWithFirstMigrationOnly() });
  legacy
    .prepare('INSERT INTO updates (document_name, connection_user_id, yjs_client_ids, server_time, update_bytes) VALUES (?, ?, ?, ?, ?)')
    .run(DOCUMENT, 'ana', '[7]', 1, new Uint8Array([0]));
  legacy
    .prepare('INSERT INTO client_identities (document_name, yjs_client_id, user_id, source) VALUES (?, ?, ?, ?)')
    .run(DOCUMENT, 7, 'ana', 'observed');
  legacy.close();
  const migrated = openTestDatabase({ set: MigrationSet.History, path });
  const updateActor = migrated.prepare('SELECT connection_actor FROM updates').get() as { connection_actor: ClientActor };
  const identityActor = migrated.prepare('SELECT actor FROM client_identities').get() as { actor: ClientActor };
  expect([updateActor.connection_actor, identityActor.actor]).toEqual([ClientActor.Human, ClientActor.Human]);
});

test('forget removes the agent actions of the document', () => {
  const sqlite = openTestDatabase({ set: MigrationSet.History });
  const actions = new AgentActionsLog(sqlite);
  actions.record({ documentName: DOCUMENT, userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt: 1 });
  new UpdateLog(sqlite).forget(DOCUMENT);
  expect(actions.list({ documentName: DOCUMENT, from: 0, until: 100 })).toEqual([]);
});
