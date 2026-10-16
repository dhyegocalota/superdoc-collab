import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { HISTORY_DATABASE_FILE, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { readEvents } from '../testing/events-client';
import { startTestServer } from '../testing/test-server';
import { IMPORT_FAILED_MESSAGE, PROJECTION_FAILED_MESSAGE, ProjectionRequestKind } from './projection-messages';
import { MAX_WORKER_RESTARTS_PER_WINDOW, type ProjectionScheduler } from './projection-scheduler';

const PROJECTION_TIMEOUT_MS = 15_000;
const IMPORT_TEST_TIMEOUT_MS = 40_000;
const SCHEDULE_CALLS = 5;
const EDIT_COUNT = 50;
const SUCCESSIVE_LOG_ENTRIES = EDIT_COUNT + 2;
const LOG_BATCH_LIMIT = 100;

test('a terminated worker is restarted and completes without duplicates', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  Array.from({ length: EDIT_COUNT }).forEach((_, index) => writeStory({ document: client.document, texts: ['y'.repeat(index + 1)] }));
  await expect.poll(() => server.services.log.readBatch({ documentName: documentId, afterSequence: 0, limit: LOG_BATCH_LIMIT }).length).toBe(SUCCESSIVE_LOG_ENTRIES);
  const firstWorker = server.services.scheduler.currentWorker;
  server.services.scheduler.schedule(documentId);
  await firstWorker.terminate();
  server.services.scheduler.schedule(documentId);
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), { timeout: PROJECTION_TIMEOUT_MS }).toBe('y'.repeat(EDIT_COUNT));
  expect(server.services.scheduler.currentWorker).not.toBe(firstWorker);
  client.close();
  await server.stop();
});

test('scheduling a busy document coalesces into one rerun', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage');
  Array.from({ length: SCHEDULE_CALLS }).forEach(() => server.services.scheduler.schedule(documentId));
  await server.services.scheduler.forget(randomUUID());
  const projectMessages = postMessage.mock.calls.filter(([message]) => (message as { kind: ProjectionRequestKind }).kind === ProjectionRequestKind.Project);
  expect(projectMessages).toHaveLength(2);
  await server.stop();
});

test('a failed import is logged once and leaves the document usable', { timeout: IMPORT_TEST_TIMEOUT_MS }, async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  server.services.runtime.importRevisions(documentId);
  server.services.runtime.importRevisions(documentId);
  await server.services.scheduler.forget(randomUUID());
  expect(consoleError).toHaveBeenCalledTimes(1);
  const [message] = consoleError.mock.calls[0] as [string];
  expect(message.startsWith(`${IMPORT_FAILED_MESSAGE} ${documentId}: `)).toBe(true);
  expect(message).not.toContain('\n');
  consoleError.mockRestore();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  expect(await readEvents({ server, cookie: owner.cookie, documentId })).toEqual([]);
  client.close();
  await server.stop();
});

test('stop ends the worker cleanly', async () => {
  const { server } = await documentWithOwner();
  const worker = server.services.scheduler.currentWorker;
  const exitCode = new Promise<number>((resolve) => worker.once('exit', resolve));
  await server.services.scheduler.stop();
  expect(await exitCode).toBe(0);
  expect(server.services.scheduler.currentWorker).toBe(worker);
  await server.stop();
});

const GARBAGE_UPDATE = Buffer.from([255, 255, 255, 255]);

function insertGarbageUpdate({ databaseDirectory, documentId }: { databaseDirectory: string; documentId: string }): void {
  const sqlite = new Database(join(databaseDirectory, HISTORY_DATABASE_FILE));
  sqlite.prepare("INSERT INTO updates (document_name, connection_user_id, yjs_client_ids, server_time, update_bytes) VALUES (?, 'nobody', '[]', 0, ?)").run(documentId, GARBAGE_UPDATE);
  sqlite.close();
}

async function terminateCurrentWorker(scheduler: ProjectionScheduler): Promise<void> {
  await scheduler.currentWorker.terminate();
}

test('a failing document is logged once and does not stop other documents', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const brokenId = randomUUID();
  insertGarbageUpdate({ databaseDirectory: server.databaseDirectory, documentId: brokenId });
  server.services.scheduler.schedule(brokenId);
  await server.services.scheduler.forget(randomUUID());
  server.services.scheduler.schedule(brokenId);
  await server.services.scheduler.forget(randomUUID());
  const failures = consoleError.mock.calls.filter(([message]) => String(message).startsWith(`${PROJECTION_FAILED_MESSAGE} ${brokenId}: `));
  expect(failures).toHaveLength(1);
  consoleError.mockRestore();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['ok'] });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), { timeout: PROJECTION_TIMEOUT_MS }).toBe('ok');
  client.close();
  await server.stop();
});

test('exceeding the restart budget stops respawning and logs one line', async () => {
  const { server } = await documentWithOwner();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await Array.from({ length: MAX_WORKER_RESTARTS_PER_WINDOW + 1 }).reduce<Promise<void>>(async (previous) => {
    await previous;
    await terminateCurrentWorker(server.services.scheduler);
  }, Promise.resolve());
  const lastWorker = server.services.scheduler.currentWorker;
  expect(server.services.scheduler.degraded).toBe(true);
  expect(consoleError).toHaveBeenCalledTimes(1);
  server.services.scheduler.schedule(randomUUID());
  await server.services.scheduler.forget(randomUUID());
  expect(server.services.scheduler.currentWorker).toBe(lastWorker);
  consoleError.mockRestore();
  await server.stop();
});

test('forgetting the same document twice settles both calls', async () => {
  const { server, documentId } = await documentWithOwner();
  await Promise.all([server.services.scheduler.forget(documentId), server.services.scheduler.forget(documentId)]);
  await server.stop();
});

test('startup projects a document with unprojected updates', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['late'] });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), { timeout: PROJECTION_TIMEOUT_MS }).toBe('late');
  client.close();
  await server.stop();
  const readModel = new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE));
  readModel.exec('DELETE FROM edit_events; DELETE FROM projection_cursor;');
  readModel.close();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  await expect.poll(() => restarted.services.readModel.read({ documentName: documentId, afterSequence: null }).map((event) => event.inserted).join(''), { timeout: PROJECTION_TIMEOUT_MS }).toBe('late');
  await restarted.stop();
});
