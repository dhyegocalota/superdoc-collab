import { buildSeedDocx, TrackedChangeKind } from '@superdoc-collab/history';
import { LARGE_DOCUMENT_HEAP_BYTES, MAX_PENDING_VERSION_JOBS } from '@superdoc-collab/types';
import { commitBootstrap, writeStory } from '@superdoc-collab/history/testing';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  BootstrapInterruptedError,
  ProjectionBusyError,
  ProjectionDegradedError,
  ProjectionReplyKind,
  ProjectionRequestCrashedError,
  ProjectionRequestKind,
  ProjectionStoppedError,
  WORKER_RECYCLED_MESSAGE,
  type ProjectionRequest,
} from './projection-messages';
import { MAX_REQUEST_POSTS, MAX_WORKER_RESTARTS_PER_WINDOW, ProjectionScheduler } from './projection-scheduler';
import { waitForCommit } from '../testing/committed-room';

const PROJECTION_TIMEOUT_MS = 15_000;
const IMPORT_TEST_TIMEOUT_MS = 40_000;
const SCHEDULE_CALLS = 5;
const EDIT_COUNT = 50;
const SUCCESSIVE_LOG_ENTRIES = EDIT_COUNT + 2;
const LOG_BATCH_LIMIT = 100;
const PROBE_SEQUENCE = 4242;
const PROBE_WORKER_FILE_NAME = 'probe-worker.js';
const MISSING_WORKER_FILE_NAME = 'missing-worker.js';
const MISSING_FILE_ERRORS_BEFORE_CRASH = 2;
const WORKER_HEAP_MEGABYTES = 192;
const RECYCLE_QUIET_TEST_MS = 50;
const BURST_QUIET_MS = 400;
const BURST_REQUESTS = 4;
const STOP_DELAY_MS = 300;

test('a terminated worker is restarted and completes without duplicates', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  await waitForCommit({ services: server.services, documentId });
  Array.from({ length: EDIT_COUNT }).forEach((_, index) => writeStory({ document: client.document, texts: ['y'.repeat(index + 1)] }));
  await expect
    .poll(() => server.services.updateLog.readBatch({ documentName: documentId, afterSequence: 0, limit: LOG_BATCH_LIMIT }).length)
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
  await waitForCommit({ services: server.services, documentId });
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
  expect(server.services.scheduler.isDegraded).toBe(true);
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
  await waitForCommit({ services: server.services, documentId });
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

type SchedulerInternals = { inFlight: Set<string>; documentsNeedingRerun: Set<string>; settle: (reply: unknown) => void };

async function projectedDocument() {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  await waitForCommit({ services: server.services, documentId });
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
  await waitForCommit({ services: server.services, documentId });
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
  await waitForCommit({ services: server.services, documentId });
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
  expect([internals.inFlight.has(documentId), internals.documentsNeedingRerun.has(documentId)]).toEqual([true, true]);
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
  server.services.scheduler.isDegraded = true;
  await expect(server.services.scheduler.version({ documentId, sequence: UNKNOWN_SEQUENCE })).rejects.toBeInstanceOf(
    ProjectionDegradedError,
  );
  server.services.scheduler.isDegraded = false;
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
  server.services.scheduler.isDegraded = true;
  await server.services.scheduler.rebuild({ documentId, filePath: 'unused.docx' });
  expect(server.services.scheduler.isRebuilding(documentId)).toBe(false);
  server.services.scheduler.isDegraded = false;
  await server.stop();
});

test('a blocks reply resolves its waiter whatever cursor it carries', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const internals = server.services.scheduler as unknown as SchedulerInternals;
  const blocks = server.services.scheduler.blocks(documentId);
  internals.settle({ kind: ProjectionRequestKind.Blocks, documentId, sequence: 7, blocks: [] });
  await expect(blocks).resolves.toMatchObject({ sequence: 7 });
  postMessage.mockRestore();
  await server.stop();
});

test('a version failure rejects only the waiter of that sequence', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const internals = server.services.scheduler as unknown as SchedulerInternals;
  const [first, second] = [1, 2].map((sequence) => server.services.scheduler.version({ documentId, sequence }));
  internals.settle({
    kind: ProjectionReplyKind.Failed,
    documentId,
    message: 'boom',
    requestKind: ProjectionRequestKind.Version,
    sequence: 1,
  });
  internals.settle({ kind: ProjectionRequestKind.Version, documentId, sequence: 2, serverTime: 0, state: new Uint8Array(), text: '' });
  await expect(first).rejects.toThrow('boom');
  await expect(second).resolves.toMatchObject({ sequence: 2 });
  postMessage.mockRestore();
  await server.stop();
});

test('a rebuild imports after forgetting, projects after importing, and ends after projecting', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const internals = server.services.scheduler as unknown as SchedulerInternals;
  const done = (kind: ProjectionRequestKind) => internals.settle({ kind, documentId, cursor: null, importError: null });
  const rebuilt = server.services.scheduler.rebuild({ documentId, filePath: 'plan.docx' });
  done(ProjectionRequestKind.Forget);
  await rebuilt;
  expect(postMessage).toHaveBeenLastCalledWith({ kind: ProjectionRequestKind.Import, documentId, filePath: 'plan.docx' });
  done(ProjectionRequestKind.Import);
  expect(postMessage).toHaveBeenLastCalledWith({ kind: ProjectionRequestKind.Project, documentId });
  expect(server.services.scheduler.isRebuilding(documentId)).toBe(true);
  done(ProjectionRequestKind.Project);
  expect(server.services.scheduler.isRebuilding(documentId)).toBe(false);
  postMessage.mockRestore();
  await server.stop();
});

test('a given worker file is the one spawned', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-probe-'));
  const probeSource = `import { parentPort } from 'node:worker_threads';
parentPort.on('message', (request) => {
  if (request.kind === '${ProjectionRequestKind.Stop}') process.exit(0);
  if (request.kind === '${ProjectionRequestKind.Blocks}') parentPort.postMessage({ kind: '${ProjectionRequestKind.Blocks}', documentId: request.documentId, sequence: ${PROBE_SEQUENCE}, blocks: [] });
});
`;
  writeFileSync(join(directory, PROBE_WORKER_FILE_NAME), probeSource);
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    projectionWorkerFile: pathToFileURL(join(directory, PROBE_WORKER_FILE_NAME)),
  });
  const reply = await scheduler.blocks(randomUUID());
  expect(reply.sequence).toBe(PROBE_SEQUENCE);
  await scheduler.stop();
});

test('a worker heap limit is the old generation limit of the spawned worker', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-heap-'));
  writeFileSync(join(directory, PROBE_WORKER_FILE_NAME), 'setInterval(() => undefined, 1000);\n');
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    projectionWorkerFile: pathToFileURL(join(directory, PROBE_WORKER_FILE_NAME)),
    workerHeapMegabytes: WORKER_HEAP_MEGABYTES,
  });
  expect(scheduler.currentWorker.resourceLimits?.maxOldGenerationSizeMb).toBe(WORKER_HEAP_MEGABYTES);
  await scheduler.currentWorker.terminate();
});

test('without a worker heap limit the spawned worker keeps the default limits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-heap-'));
  writeFileSync(join(directory, PROBE_WORKER_FILE_NAME), 'setInterval(() => undefined, 1000);\n');
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    projectionWorkerFile: pathToFileURL(join(directory, PROBE_WORKER_FILE_NAME)),
  });
  expect(scheduler.currentWorker.resourceLimits?.maxOldGenerationSizeMb).not.toBe(WORKER_HEAP_MEGABYTES);
  await scheduler.currentWorker.terminate();
});

test('a missing worker file crashes the first request then degrades the scheduler', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-missing-'));
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    projectionWorkerFile: pathToFileURL(join(directory, MISSING_WORKER_FILE_NAME)),
  });
  await expect(scheduler.blocks(randomUUID())).rejects.toBeInstanceOf(ProjectionRequestCrashedError);
  expect(consoleError).toHaveBeenCalledTimes(MISSING_FILE_ERRORS_BEFORE_CRASH);
  expect(scheduler.isDegraded).toBe(false);
  await expect.poll(() => scheduler.isDegraded).toBe(true);
  await expect.poll(() => consoleError.mock.calls.length).toBe(MAX_WORKER_RESTARTS_PER_WINDOW + 2);
  await expect(scheduler.blocks(randomUUID())).rejects.toBeInstanceOf(ProjectionDegradedError);
  consoleError.mockRestore();
  await scheduler.stop();
});

test('above the pending cap a version is refused instead of queued', async () => {
  const { server, documentId, client } = await projectedDocument();
  const { scheduler } = server.services;
  const pending = Array.from({ length: MAX_PENDING_VERSION_JOBS }, (_, index) => scheduler.version({ documentId, sequence: index + 1 }));
  const settled = Promise.allSettled(pending);
  await expect(scheduler.version({ documentId, sequence: MAX_PENDING_VERSION_JOBS + 1 })).rejects.toBeInstanceOf(ProjectionBusyError);
  await settled;
  client.close();
  await server.stop();
});

test('a full version queue refuses a new version but lets a pending one be joined', async () => {
  const { server, documentId, client } = await projectedDocument();
  const { scheduler } = server.services;
  const settled = Promise.allSettled(
    Array.from({ length: MAX_PENDING_VERSION_JOBS }, (_, index) => scheduler.version({ documentId, sequence: index + 1 })),
  );
  expect(scheduler.refusesVersion({ documentId, sequence: MAX_PENDING_VERSION_JOBS + 1 })).toBe(true);
  expect(scheduler.refusesVersion({ documentId, sequence: 1 })).toBe(false);
  await settled;
  client.close();
  await server.stop();
});

const BOOTSTRAP_REQUEST = { documentId: 'bootstrapped', filePath: 'plan.docx', url: 'ws://127.0.0.1:1', token: 'token' };

function schedulerWithProbe(probeSource: string): ProjectionScheduler {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-probe-'));
  writeFileSync(join(directory, PROBE_WORKER_FILE_NAME), probeSource);
  return new ProjectionScheduler({
    databaseDirectory: directory,
    projectionWorkerFile: pathToFileURL(join(directory, PROBE_WORKER_FILE_NAME)),
  });
}

test('a bootstrap resolves when the worker answers it', async () => {
  const scheduler = schedulerWithProbe(`import { parentPort } from 'node:worker_threads';
parentPort.on('message', (request) => {
  if (request.kind === '${ProjectionRequestKind.Stop}') process.exit(0);
  if (request.kind === '${ProjectionRequestKind.Bootstrap}') parentPort.postMessage({ kind: '${ProjectionRequestKind.Bootstrap}', documentId: request.documentId });
});
`);
  await expect(scheduler.bootstrap(BOOTSTRAP_REQUEST)).resolves.toBeUndefined();
  await scheduler.stop();
});

test('a bootstrap the worker fails rejects with the message of the worker', async () => {
  const scheduler = schedulerWithProbe(`import { parentPort } from 'node:worker_threads';
parentPort.on('message', (request) => {
  if (request.kind === '${ProjectionRequestKind.Stop}') process.exit(0);
  if (request.kind === '${ProjectionRequestKind.Bootstrap}') parentPort.postMessage({ kind: '${ProjectionReplyKind.Failed}', requestKind: request.kind, documentId: request.documentId, sequence: null, message: 'not a document' });
});
`);
  await expect(scheduler.bootstrap(BOOTSTRAP_REQUEST)).rejects.toThrow('not a document');
  await scheduler.stop();
});

test('a bootstrap in flight when the worker dies is rejected as interrupted and not posted again', async () => {
  const scheduler = schedulerWithProbe('setInterval(() => undefined, 1000);\n');
  const crashed = scheduler.currentWorker;
  const bootstrap = scheduler.bootstrap(BOOTSTRAP_REQUEST);
  bootstrap.catch(() => undefined);
  await crashed.terminate();
  await expect(bootstrap).rejects.toBeInstanceOf(BootstrapInterruptedError);
  await expect.poll(() => scheduler.currentWorker !== crashed).toBe(true);
  await scheduler.currentWorker.terminate();
});

test('a degraded scheduler rejects a bootstrap at once', async () => {
  const scheduler = schedulerWithProbe('setInterval(() => undefined, 1000);\n');
  scheduler.isDegraded = true;
  await expect(scheduler.bootstrap(BOOTSTRAP_REQUEST)).rejects.toBeInstanceOf(ProjectionDegradedError);
  scheduler.isDegraded = false;
  await scheduler.currentWorker.terminate();
});

function writeHeapProbeWorker({
  directory,
  heapTotalBytes,
  stopDelayMs = 0,
}: {
  directory: string;
  heapTotalBytes: number;
  stopDelayMs?: number;
}): URL {
  const source = `import { parentPort, threadId } from 'node:worker_threads';
let isStopping = false;
parentPort.on('message', (request) => {
  if (request.kind === '${ProjectionRequestKind.Stop}') {
    isStopping = true;
    return void setTimeout(() => process.exit(0), ${stopDelayMs});
  }
  if (isStopping) return;
  parentPort.postMessage({ kind: '${ProjectionRequestKind.Blocks}', documentId: request.documentId, sequence: threadId, blocks: [], heapTotalBytes: ${heapTotalBytes} });
});
`;
  writeFileSync(join(directory, PROBE_WORKER_FILE_NAME), source);
  return pathToFileURL(join(directory, PROBE_WORKER_FILE_NAME));
}

test('a worker whose heap stays above the large document size is recycled and the next job runs on a fresh worker', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    recycleQuietMs: RECYCLE_QUIET_TEST_MS,
    projectionWorkerFile: writeHeapProbeWorker({ directory, heapTotalBytes: LARGE_DOCUMENT_HEAP_BYTES + 1 }),
  });
  const heavyWorker = scheduler.currentWorker;
  const firstReply = await scheduler.blocks(randomUUID());
  expect(firstReply.sequence).toBe(heavyWorker.threadId);
  await expect.poll(() => scheduler.currentWorker !== heavyWorker).toBe(true);
  const secondReply = await scheduler.blocks(randomUUID());
  expect(secondReply.sequence).not.toBe(firstReply.sequence);
  expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining(WORKER_RECYCLED_MESSAGE));
  consoleInfo.mockRestore();
  await scheduler.currentWorker.terminate();
});

test('requests already queued behind a heavy job still resolve when the worker is recycled', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    recycleQuietMs: RECYCLE_QUIET_TEST_MS,
    projectionWorkerFile: writeHeapProbeWorker({ directory, heapTotalBytes: LARGE_DOCUMENT_HEAP_BYTES + 1 }),
  });
  const replies = await Promise.all([scheduler.blocks(randomUUID()), scheduler.blocks(randomUUID()), scheduler.blocks(randomUUID())]);
  expect(replies).toHaveLength(3);
  await scheduler.currentWorker.terminate();
});

test('recycling a worker does not spend the restart budget', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    recycleQuietMs: RECYCLE_QUIET_TEST_MS,
    projectionWorkerFile: writeHeapProbeWorker({ directory, heapTotalBytes: LARGE_DOCUMENT_HEAP_BYTES + 1 }),
  });
  await Array.from({ length: MAX_WORKER_RESTARTS_PER_WINDOW + 2 }).reduce<Promise<unknown>>(async (previous) => {
    await previous;
    const worker = scheduler.currentWorker;
    await scheduler.blocks(randomUUID());
    await expect.poll(() => scheduler.currentWorker !== worker).toBe(true);
  }, Promise.resolve());
  expect(scheduler.isDegraded).toBe(false);
  await scheduler.currentWorker.terminate();
});

test('a worker whose heap is below the large document size is kept', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    recycleQuietMs: RECYCLE_QUIET_TEST_MS,
    projectionWorkerFile: writeHeapProbeWorker({ directory, heapTotalBytes: LARGE_DOCUMENT_HEAP_BYTES }),
  });
  const worker = scheduler.currentWorker;
  await scheduler.blocks(randomUUID());
  await scheduler.blocks(randomUUID());
  expect(scheduler.currentWorker).toBe(worker);
  await worker.terminate();
});

test('a burst of requests keeps the worker and its caches until the quiet period passes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    recycleQuietMs: BURST_QUIET_MS,
    projectionWorkerFile: writeHeapProbeWorker({ directory, heapTotalBytes: LARGE_DOCUMENT_HEAP_BYTES + 1 }),
  });
  const worker = scheduler.currentWorker;
  await Array.from({ length: BURST_REQUESTS }).reduce<Promise<unknown>>(async (previous) => {
    await previous;
    await scheduler.blocks(randomUUID());
  }, Promise.resolve());
  expect(scheduler.currentWorker).toBe(worker);
  await expect.poll(() => scheduler.currentWorker !== worker).toBe(true);
  await scheduler.currentWorker.terminate();
});

test('a request posted after the stop is posted again to the fresh worker and resolves', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    recycleQuietMs: RECYCLE_QUIET_TEST_MS,
    projectionWorkerFile: writeHeapProbeWorker({ directory, heapTotalBytes: LARGE_DOCUMENT_HEAP_BYTES + 1, stopDelayMs: STOP_DELAY_MS }),
  });
  const heavyWorker = scheduler.currentWorker;
  const postMessage = vi.spyOn(heavyWorker, 'postMessage');
  const firstReply = await scheduler.blocks(randomUUID());
  await expect
    .poll(() => postMessage.mock.calls.some(([message]) => (message as ProjectionRequest).kind === ProjectionRequestKind.Stop))
    .toBe(true);
  const lateReply = await scheduler.blocks(randomUUID());
  expect(lateReply.sequence).not.toBe(firstReply.sequence);
  expect(scheduler.currentWorker).not.toBe(heavyWorker);
  await scheduler.currentWorker.terminate();
});

test('a bootstrap posted while the worker is being recycled is posted again to the fresh worker and resolves', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'superdoc-collab-recycle-'));
  writeFileSync(
    join(directory, PROBE_WORKER_FILE_NAME),
    `import { parentPort } from 'node:worker_threads';
parentPort.on('message', (request) => {
  if (request.kind === '${ProjectionRequestKind.Stop}') process.exit(0);
  if (request.kind === '${ProjectionRequestKind.Blocks}') parentPort.postMessage({ kind: '${ProjectionRequestKind.Blocks}', documentId: request.documentId, sequence: 0, blocks: [], heapTotalBytes: ${LARGE_DOCUMENT_HEAP_BYTES + 1} });
  if (request.kind === '${ProjectionRequestKind.Bootstrap}') parentPort.postMessage({ kind: '${ProjectionRequestKind.Bootstrap}', documentId: request.documentId, heapTotalBytes: 0 });
});
`,
  );
  const scheduler = new ProjectionScheduler({
    databaseDirectory: directory,
    projectionWorkerFile: pathToFileURL(join(directory, PROBE_WORKER_FILE_NAME)),
  });
  const heavyWorker = scheduler.currentWorker;
  (scheduler as unknown as { recycleWhenIdle: (heapTotalBytes: number) => void }).recycleWhenIdle(LARGE_DOCUMENT_HEAP_BYTES + 1);
  await expect(scheduler.bootstrap(BOOTSTRAP_REQUEST)).resolves.toBeUndefined();
  expect(scheduler.currentWorker).not.toBe(heavyWorker);
  await scheduler.currentWorker.terminate();
});
