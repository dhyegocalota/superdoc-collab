import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { readEvents } from '../testing/events-client';
import { IMPORT_FAILED_MESSAGE, ProjectionRequestKind } from './projection-messages';

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
