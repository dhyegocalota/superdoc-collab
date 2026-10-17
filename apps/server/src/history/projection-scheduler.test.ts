import { buildSeedDocx, TrackedChangeKind } from '@superdoc-history/history';
import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { expect, test, vi } from 'vitest';
import { HISTORY_DATABASE_FILE, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { readEvents } from '../testing/events-client';
import { signInExisting, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';
import {
  IMPORT_FAILED_MESSAGE,
  IMPORT_SKIPPED_MESSAGE,
  IMPORT_TIMEOUT_MS,
  PROJECTION_FAILED_MESSAGE,
  ProjectionDegradedError,
  ProjectionReplyKind,
  ProjectionRequestCrashedError,
  ProjectionRequestKind,
  ProjectionStoppedError,
  type ProjectionRequest,
} from './projection-messages';
import { MAX_REQUEST_POSTS, MAX_WORKER_RESTARTS_PER_WINDOW, type ProjectionScheduler } from './projection-scheduler';

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
  await expect
    .poll(() => server.services.log.readBatch({ documentName: documentId, afterSequence: 0, limit: LOG_BATCH_LIMIT }).length)
    .toBe(SUCCESSIVE_LOG_ENTRIES);
  const firstWorker = server.services.scheduler.currentWorker;
  server.services.scheduler.schedule(documentId);
  await firstWorker.terminate();
  server.services.scheduler.schedule(documentId);
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), {
      timeout: PROJECTION_TIMEOUT_MS,
    })
    .toBe('y'.repeat(EDIT_COUNT));
  expect(server.services.scheduler.currentWorker).not.toBe(firstWorker);
  client.close();
  await server.stop();
});

test('scheduling a busy document coalesces into one rerun', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage');
  Array.from({ length: SCHEDULE_CALLS }).forEach(() => server.services.scheduler.schedule(documentId));
  await server.services.scheduler.forget(randomUUID());
  const projectMessages = postMessage.mock.calls.filter(
    ([message]) => (message as { kind: ProjectionRequestKind }).kind === ProjectionRequestKind.Project,
  );
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

test('an import interrupted by a worker restart is posted again and completes', { timeout: IMPORT_TEST_TIMEOUT_MS }, async () => {
  const { server } = await documentWithOwner();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const firstWorker = server.services.scheduler.currentWorker;
  vi.spyOn(firstWorker, 'postMessage').mockImplementation(() => undefined);
  const documentId = randomUUID();
  server.services.scheduler.importRevisions({ documentId, filePath: join(server.databaseDirectory, 'missing.docx') });
  await firstWorker.terminate();
  await expect
    .poll(
      () => consoleError.mock.calls.filter(([message]) => String(message).startsWith(`${IMPORT_FAILED_MESSAGE} ${documentId}: `)).length,
      { timeout: IMPORT_TEST_TIMEOUT_MS },
    )
    .toBe(1);
  expect(server.services.scheduler.currentWorker).not.toBe(firstWorker);
  consoleError.mockRestore();
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
  sqlite
    .prepare(
      "INSERT INTO updates (document_name, connection_user_id, yjs_client_ids, server_time, update_bytes) VALUES (?, 'nobody', '[]', 0, ?)",
    )
    .run(documentId, GARBAGE_UPDATE);
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
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), {
      timeout: PROJECTION_TIMEOUT_MS,
    })
    .toBe('ok');
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
  const skippedId = randomUUID();
  server.services.scheduler.importRevisions({ documentId: skippedId, filePath: 'unused.docx' });
  expect(consoleError).toHaveBeenCalledTimes(2);
  expect(consoleError).toHaveBeenLastCalledWith(`${IMPORT_SKIPPED_MESSAGE} ${skippedId}`);
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
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), {
      timeout: PROJECTION_TIMEOUT_MS,
    })
    .toBe('late');
  client.close();
  await server.stop();
  const readModel = new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE));
  readModel.exec('DELETE FROM edit_events; DELETE FROM projection_cursor;');
  readModel.close();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  await expect
    .poll(
      () =>
        restarted.services.readModel
          .read({ documentName: documentId, afterSequence: null })
          .map((event) => event.inserted)
          .join(''),
      { timeout: PROJECTION_TIMEOUT_MS },
    )
    .toBe('late');
  await restarted.stop();
});

const UNKNOWN_SEQUENCE = 999_999;
const REBUILD_TEST_TIMEOUT_MS = 60_000;

type SchedulerInternals = { inFlight: Set<string>; rerun: Set<string>; settle: (reply: unknown) => void };

async function projectedDocument() {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  await expect.poll(() => server.services.readModel.marks(documentId).length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(0);
  return { server, documentId, owner, client, sequence: server.services.readModel.marks(documentId)[0]!.sequence };
}

function inFlightWithRerun({
  server,
  documentId,
}: {
  server: Awaited<ReturnType<typeof documentWithOwner>>['server'];
  documentId: string;
}): { internals: SchedulerInternals; restore: () => void } {
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  server.services.scheduler.schedule(documentId);
  server.services.scheduler.schedule(documentId);
  return { internals: server.services.scheduler as unknown as SchedulerInternals, restore: () => postMessage.mockRestore() };
}

test('a hanging import does not delay the projection of another document', { timeout: IMPORT_TIMEOUT_MS / 2 }, async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const fifo = join(server.databaseDirectory, 'never-written.docx');
  execFileSync('mkfifo', [fifo]);
  server.services.scheduler.importRevisions({ documentId: randomUUID(), filePath: fifo });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['a'] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['ab'] });
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), {
      timeout: IMPORT_TIMEOUT_MS / 3,
    })
    .toBe('b');
  client.close();
  await server.stop();
});

test('a document projected before marks existed is rebuilt at startup', { timeout: REBUILD_TEST_TIMEOUT_MS }, async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const bytes = await buildSeedDocx([
    {
      text: 'Preamble by',
      trackedChanges: [{ kind: TrackedChangeKind.Insert, author: 'Chris Crawford', date: '2026-02-12T09:01:00Z', text: ' developers' }],
    },
  ]);
  await server.services.storage.put({ documentId, bytes });
  server.services.runtime.importRevisions(documentId);
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['a'] });
  writeStory({ document: client.document, texts: ['ab'] });
  const importedAndInserted = async () =>
    (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => [event.imported, event.inserted]);
  const expected = [
    [true, ' developers'],
    [false, 'a'],
    [false, 'b'],
  ];
  await expect.poll(importedAndInserted, { timeout: REBUILD_TEST_TIMEOUT_MS / 2 }).toEqual(expected);
  client.close();
  await server.stop();
  const readModelSqlite = new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE));
  readModelSqlite.exec('DELETE FROM version_marks');
  readModelSqlite.close();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  expect(restarted.services.scheduler.isRebuilding(documentId)).toBe(true);
  await expect.poll(() => restarted.services.scheduler.isRebuilding(documentId), { timeout: REBUILD_TEST_TIMEOUT_MS / 2 }).toBe(false);
  expect(restarted.services.readModel.marks(documentId).some((mark) => mark.isBootstrap)).toBe(true);
  const restartedCookie = await signInExisting({ server: restarted, email: owner.email, password: TEST_USER_PASSWORD });
  expect(
    (await readEvents({ server: restarted, cookie: restartedCookie, documentId })).map((event) => [event.imported, event.inserted]),
  ).toEqual(expected);
  await restarted.stop();
});

test('a failed version never touches the projection bookkeeping', async () => {
  const { server, documentId } = await documentWithOwner();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { internals, restore } = inFlightWithRerun({ server, documentId });
  const version = server.services.scheduler.version({ documentId, sequence: UNKNOWN_SEQUENCE });
  internals.settle({
    kind: ProjectionReplyKind.Failed,
    documentId,
    message: 'boom',
    requestKind: ProjectionRequestKind.Version,
    sequence: UNKNOWN_SEQUENCE,
  });
  await expect(version).rejects.toThrow('boom');
  expect([internals.inFlight.has(documentId), internals.rerun.has(documentId)]).toEqual([true, true]);
  expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining(PROJECTION_FAILED_MESSAGE));
  consoleError.mockRestore();
  restore();
  await server.stop();
});

test('version requests for the same mark share one worker round trip', async () => {
  const { server, documentId, client, sequence } = await projectedDocument();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage');
  const [first, second] = await Promise.all([
    server.services.scheduler.version({ documentId, sequence }),
    server.services.scheduler.version({ documentId, sequence }),
  ]);
  expect(
    postMessage.mock.calls.filter(([message]) => (message as { kind: ProjectionRequestKind }).kind === ProjectionRequestKind.Version),
  ).toHaveLength(1);
  expect(first.text).toBe(second.text);
  client.close();
  await server.stop();
});

test('a version of an unknown mark rejects naming the error', async () => {
  const { server, documentId } = await documentWithOwner();
  await expect(server.services.scheduler.version({ documentId, sequence: UNKNOWN_SEQUENCE })).rejects.toThrow(/MissingVersionMarkError/);
  await server.stop();
});

test('blocks returns the story at the projection cursor', async () => {
  const { server, documentId, client } = await projectedDocument();
  const reply = await server.services.scheduler.blocks(documentId);
  expect(reply.blocks[0]?.text).toBe('Hello');
  client.close();
  await server.stop();
});

test('a degraded scheduler rejects versions at once', async () => {
  const { server, documentId } = await documentWithOwner();
  server.services.scheduler.degraded = true;
  await expect(server.services.scheduler.version({ documentId, sequence: UNKNOWN_SEQUENCE })).rejects.toBeInstanceOf(
    ProjectionDegradedError,
  );
  server.services.scheduler.degraded = false;
  await server.stop();
});

test('a terminated worker re-posts a waiting version', async () => {
  const { server, documentId, client, sequence } = await projectedDocument();
  const firstWorker = server.services.scheduler.currentWorker;
  const postMessage = vi.spyOn(firstWorker, 'postMessage').mockImplementation(() => undefined);
  const version = server.services.scheduler.version({ documentId, sequence });
  await firstWorker.terminate();
  postMessage.mockRestore();
  expect((await version).sequence).toBe(sequence);
  client.close();
  await server.stop();
});

async function crashWorker(scheduler: ProjectionScheduler): Promise<void> {
  const crashed = scheduler.currentWorker;
  await crashed.terminate();
  await expect.poll(() => scheduler.currentWorker !== crashed).toBe(true);
}

function isVersionRequest(message: unknown): boolean {
  return (message as ProjectionRequest).kind === ProjectionRequestKind.Version;
}

test('a version still waiting after two worker crashes is rejected instead of posted a third time', async () => {
  const { server, documentId, client, sequence } = await projectedDocument();
  const { scheduler } = server.services;
  const post = Worker.prototype.postMessage;
  const posts = vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (this: Worker, message: unknown) {
    if (isVersionRequest(message)) return;
    post.call(this, message);
  });
  const version = scheduler.version({ documentId, sequence });
  version.catch(() => undefined);
  await crashWorker(scheduler);
  await crashWorker(scheduler);
  await expect(version).rejects.toBeInstanceOf(ProjectionRequestCrashedError);
  expect(posts.mock.calls.filter(([message]) => isVersionRequest(message))).toHaveLength(MAX_REQUEST_POSTS);
  posts.mockRestore();
  client.close();
  await server.stop();
});

function doneReply({ kind, documentId }: { kind: ProjectionRequestKind; documentId: string }) {
  return { kind, documentId, cursor: null, importError: null };
}

test('a stale projection reply does not end a rebuild before the import is back', async () => {
  const { server, documentId } = await documentWithOwner();
  const { internals, restore } = inFlightWithRerun({ server, documentId });
  const { scheduler } = server.services;
  const rebuilt = scheduler.rebuild({ documentId, filePath: 'unused.docx' });
  internals.settle(doneReply({ kind: ProjectionRequestKind.Project, documentId }));
  expect(scheduler.isRebuilding(documentId)).toBe(true);
  internals.settle(doneReply({ kind: ProjectionRequestKind.Forget, documentId }));
  await rebuilt;
  internals.settle(doneReply({ kind: ProjectionRequestKind.Project, documentId }));
  expect(scheduler.isRebuilding(documentId)).toBe(true);
  internals.settle(doneReply({ kind: ProjectionRequestKind.Import, documentId }));
  internals.settle(doneReply({ kind: ProjectionRequestKind.Project, documentId }));
  expect(scheduler.isRebuilding(documentId)).toBe(false);
  restore();
  await server.stop();
});

test('stopping rejects waiting versions', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const version = server.services.scheduler.version({ documentId, sequence: UNKNOWN_SEQUENCE });
  const stopped = server.services.scheduler.stop();
  await expect(version).rejects.toBeInstanceOf(ProjectionStoppedError);
  postMessage.mockRestore();
  server.services.scheduler.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
  await stopped;
  await server.stop();
});

test('rebuilding a degraded scheduler leaves nothing rebuilding', async () => {
  const { server, documentId } = await documentWithOwner();
  server.services.scheduler.degraded = true;
  await server.services.scheduler.rebuild({ documentId, filePath: 'unused.docx' });
  expect(server.services.scheduler.isRebuilding(documentId)).toBe(false);
  server.services.scheduler.degraded = false;
  await server.stop();
});
