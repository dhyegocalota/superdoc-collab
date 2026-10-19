import { minuteStartOf, readMainStoryText, type ReadModel, resolveMark, type UpdateLog } from '@superdoc-collab/history';
import { commitBootstrap, writeStory } from '@superdoc-collab/history/testing';
import {
  ApiPath,
  DocumentResource,
  DocumentRole,
  HttpStatus,
  VERSION_FAILED_ERROR,
  VERSION_FAILURE_TTL_MS,
  VERSION_MARK_MS,
  VERSION_NOT_READY_ERROR,
  VersionResource,
  documentApiPath,
  versionApiPath,
  versionCollaborationPath,
  type VersionMarks,
  type VersionText,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { CollaborationRefusedError, connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { signedInUser } from '../testing/test-server';
import { editedAfterBootstrap, pollVersion, readJson, seededRandom } from '../testing/timeline-client';
import { ProjectionRequestKind, ProjectionStoppedError } from './projection-messages';
import type { ProjectionScheduler } from './projection-scheduler';
import { VersionLookupKind, VersionsService } from './versions-service';
import { waitForCommit } from '../testing/committed-room';

const MINUTES = 3;
const unknownSequenceLog = { serverTimeOf: () => null } as unknown as UpdateLog;
const SETTLE_ROUND_TRIPS = 5;
const PROPERTY_SEED = 20261016;
const SAMPLED_SEQUENCES = 20;
const PROJECTION_TIMEOUT_MS = 15_000;
const EXTRA_EDITS = 2;
const SMALL_BUDGET_BYTES = 1024;
const LARGE_STATE_BYTES = 600;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function replay(updates: { update: Uint8Array }[]): Y.Doc {
  const document = new Y.Doc({ gc: false });
  updates.forEach(({ update }) => Y.applyUpdate(document, update));
  return document;
}

test('every version served equals a full replay at its mark', { timeout: 60_000 }, async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 16, 9, 0) });
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Start'] });
  commitBootstrap(client.document);
  await waitForCommit({ services: server.services, documentId });
  await Array.from({ length: MINUTES }).reduce<Promise<void>>(async (previous, _, minute) => {
    await previous;
    vi.setSystemTime(Date.now() + VERSION_MARK_MS);
    writeStory({ document: client.document, texts: [`Start ${minute}`, minute % 2 === 0 ? `Line ${minute}` : ''] });
    await expect
      .poll(() => server.services.readModel.marks(documentId).length, { timeout: PROJECTION_TIMEOUT_MS })
      .toBeGreaterThan(minute + 1);
  }, Promise.resolve());
  const { marks } = await readJson<VersionMarks>({
    server,
    cookie: owner.cookie,
    path: `${documentApiPath({ documentId, resource: DocumentResource.Versions })}?around=${Number.MAX_SAFE_INTEGER}`,
  });
  const lastSequence = marks.at(-1)!.sequence;
  const random = seededRandom(PROPERTY_SEED);
  const sampled = Array.from({ length: SAMPLED_SEQUENCES }, () => 1 + Math.floor(random() * lastSequence));
  await Promise.all(
    [...marks.map((mark) => mark.sequence), ...sampled].map(async (sequence) => {
      const { sequence: resolved, text } = await readJson<VersionText>({
        server,
        cookie: owner.cookie,
        path: versionApiPath({ documentId, sequence, resource: VersionResource.Text }),
      });
      const serverTime = server.services.updateLog.serverTimeOf({ documentName: documentId, sequence });
      expect(resolved).toBe(resolveMark({ marks: server.services.readModel.marks(documentId), sequence, serverTime })!.sequence);
      expect(text).toBe(readMainStoryText(replay(server.services.updateLog.read({ documentName: documentId, untilSequence: resolved }))));
    }),
  );
  client.close();
  vi.useRealTimers();
  await server.stop();
});

test('a logged sequence that is not a mark resolves to itself', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const latestLogged = () =>
    server.services.updateLog.read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER }).at(-1)!.sequence;
  const loggedBefore = latestLogged();
  writeStory({ document: client.document, texts: ['Pruned within the minute'] });
  writeStory({ document: client.document, texts: ['Ends the minute'] });
  await expect.poll(latestLogged, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThanOrEqual(loggedBefore + EXTRA_EDITS);
  await expect
    .poll(() => server.services.readModel.marks(documentId).at(-1)!.sequence, { timeout: PROJECTION_TIMEOUT_MS })
    .toBe(latestLogged());
  const marks = server.services.readModel.marks(documentId);
  const newest = marks.at(-1)!;
  const prunedInNewestMinute = server.services.updateLog
    .read({ documentName: documentId, untilSequence: newest.sequence })
    .filter((update) => update.sequence > marks[0]!.sequence && !marks.some((mark) => mark.sequence === update.sequence))
    .find((update) => minuteStartOf(update.serverTime) === newest.minuteStart);
  expect(prunedInNewestMinute).toBeDefined();
  const version = await pollVersion({ server, cookie: owner.cookie, documentId, sequence: prunedInNewestMinute!.sequence });
  expect(version.sequence).toBe(prunedInNewestMinute!.sequence);
  client.close();
  await server.stop();
});

test('a sequence before the bootstrap resolves to the bootstrap version', async () => {
  const { server, documentId, owner, bootstrapText, client } = await editedAfterBootstrap();
  const version = await pollVersion({ server, cookie: owner.cookie, documentId, sequence: 1 });
  expect(version.sequence).toBe(server.services.readModel.marks(documentId).find((mark) => mark.isBootstrap)!.sequence);
  const viewer = await connectToDocument({ server, cookie: owner.cookie, documentId, path: version.collaborationPath });
  expect(readMainStoryText(viewer.document)).toBe(bootstrapText);
  [viewer, client].forEach((connected) => connected.close());
  await server.stop();
});

test('versions routes and version endpoints refuse a non-member like a missing document', async () => {
  const { server, documentId, client } = await editedAfterBootstrap();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  const paths = (id: string) => [
    `${documentApiPath({ documentId: id, resource: DocumentResource.Versions })}?around=1`,
    versionApiPath({ documentId: id, sequence }),
    versionApiPath({ documentId: id, sequence, resource: VersionResource.Text }),
  ];
  const known = await Promise.all(
    paths(documentId).map((path) => fetch(`${server.baseUrl}${path}`, { headers: { cookie: stranger.cookie } })),
  );
  const unknown = await Promise.all(
    paths(randomUUID()).map((path) => fetch(`${server.baseUrl}${path}`, { headers: { cookie: stranger.cookie } })),
  );
  expect(known.map((response) => response.status)).toEqual([HttpStatus.NotFound, HttpStatus.NotFound, HttpStatus.NotFound]);
  expect(await Promise.all(known.map((response) => response.json()))).toEqual(
    await Promise.all(unknown.map((response) => response.json())),
  );
  await expect(
    connectToDocument({ server, cookie: stranger.cookie, documentId, path: versionCollaborationPath({ documentId, sequence }) }),
  ).rejects.toBeInstanceOf(CollaborationRefusedError);
  client.close();
  await server.stop();
});

test('a reader may open a version', async () => {
  const { server, documentId, client } = await editedAfterBootstrap();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const version = await pollVersion({ server, cookie: reader.cookie, documentId, sequence: Number.MAX_SAFE_INTEGER });
  const viewer = await connectToDocument({ server, cookie: reader.cookie, documentId, path: version.collaborationPath });
  expect(readMainStoryText(viewer.document)).toBe('Original edited');
  [viewer, client].forEach((connected) => connected.close());
  await server.stop();
});

test('an unprojected document has no versions', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const unready = await fetch(`${server.baseUrl}${versionApiPath({ documentId, sequence: 1 })}`, { headers: { cookie: owner.cookie } });
  expect(unready.status).toBe(HttpStatus.Conflict);
  expect(await unready.json()).toEqual({ error: VERSION_NOT_READY_ERROR });
  const malformed = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Versions })}/abc`, {
    headers: { cookie: owner.cookie },
  });
  expect(malformed.status).toBe(HttpStatus.BadRequest);
  await server.stop();
});

test('a rebuilding document answers 202', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  vi.spyOn(server.services.scheduler, 'isRebuilding').mockReturnValue(true);
  const response = await fetch(`${server.baseUrl}${versionApiPath({ documentId, sequence: 1 })}`, { headers: { cookie: owner.cookie } });
  expect(response.status).toBe(HttpStatus.Accepted);
  expect(response.headers.get('retry-after')).toBe('1');
  await server.stop();
});

test('a viewer whose document was deleted retries the upgrade without an unhandled rejection', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const version = await pollVersion({ server, cookie: owner.cookie, documentId, sequence: Number.MAX_SAFE_INTEGER });
  const viewer = await connectToDocument({ server, cookie: owner.cookie, documentId, path: version.collaborationPath });
  const authorize = vi.spyOn(server.services.versionRooms, 'authorize');
  client.close();
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, {
    method: 'DELETE',
    headers: { cookie: owner.cookie, origin: server.baseUrl },
  });
  expect(deleted.ok).toBe(true);
  await expect.poll(() => authorize.mock.calls.length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(0);
  await Array.from({ length: SETTLE_ROUND_TRIPS }).reduce<Promise<unknown>>(async (previous) => {
    await previous;
    return fetch(`${server.baseUrl}${ApiPath.Health}`);
  }, Promise.resolve());
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
  viewer.close();
  await server.stop();
});

test('a failed load is cached and answered with 503', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const version = vi.spyOn(server.services.scheduler, 'version').mockRejectedValue(new Error('boom'));
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  const get = () => fetch(`${server.baseUrl}${versionApiPath({ documentId, sequence })}`, { headers: { cookie: owner.cookie } });
  expect((await get()).status).toBe(HttpStatus.Accepted);
  await expect.poll(async () => (await get()).status, { timeout: PROJECTION_TIMEOUT_MS }).toBe(HttpStatus.ServiceUnavailable);
  const failed = await get();
  expect(await failed.json()).toEqual({ error: VERSION_FAILED_ERROR });
  expect(failed.headers.get('retry-after')).toBe('1');
  expect(version).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledTimes(1);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + VERSION_FAILURE_TTL_MS + 1);
  expect((await get()).status).toBe(HttpStatus.Accepted);
  expect(version).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
  client.close();
  await server.stop();
});

test('the cache stays under its byte budget', async () => {
  const documentId = randomUUID();
  const marks = [1, 2].map((sequence) => ({ sequence, serverTime: sequence, minuteStart: 0, isBootstrap: false }));
  const readModel = { marks: () => marks } as unknown as ReadModel;
  const scheduler = {
    version: async ({ sequence }: { sequence: number }) => ({
      kind: ProjectionRequestKind.Version,
      documentId,
      sequence,
      serverTime: sequence,
      state: new Uint8Array(LARGE_STATE_BYTES),
      text: '',
    }),
  } as unknown as ProjectionScheduler;
  const versions = new VersionsService({ readModel, updateLog: unknownSequenceLog, scheduler, maxBytes: SMALL_BUDGET_BYTES });
  await versions.load({ documentId, sequence: 1 });
  await versions.load({ documentId, sequence: 2 });
  expect(versions.peek({ documentId, sequence: 2 }).kind).toBe(VersionLookupKind.Ready);
  expect(versions.peek({ documentId, sequence: 1 }).kind).toBe(VersionLookupKind.Pending);
});

test('deleting the document closes its version instances', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const version = await pollVersion({ server, cookie: owner.cookie, documentId, sequence: Number.MAX_SAFE_INTEGER });
  const viewer = await connectToDocument({ server, cookie: owner.cookie, documentId, path: version.collaborationPath });
  const closed = vi.fn();
  viewer.provider.on('close', closed);
  client.close();
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, {
    method: 'DELETE',
    headers: { cookie: owner.cookie, origin: server.baseUrl },
  });
  expect(deleted.ok).toBe(true);
  await expect.poll(() => closed.mock.calls.length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(0);
  expect(server.services.versionRooms.size()).toBe(0);
  viewer.close();
  await server.stop();
});

test('a cached failure answers text with 503 and refuses the version instance without rerunning the worker', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const version = vi.spyOn(server.services.scheduler, 'version').mockRejectedValue(new Error('boom'));
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  const get = (path: string) => fetch(`${server.baseUrl}${path}`, { headers: { cookie: owner.cookie } });
  await get(versionApiPath({ documentId, sequence }));
  await expect
    .poll(async () => (await get(versionApiPath({ documentId, sequence }))).status, { timeout: PROJECTION_TIMEOUT_MS })
    .toBe(HttpStatus.ServiceUnavailable);
  const text = await get(versionApiPath({ documentId, sequence, resource: VersionResource.Text }));
  expect(text.status).toBe(HttpStatus.ServiceUnavailable);
  expect(text.headers.get('retry-after')).toBe('1');
  await expect(
    connectToDocument({ server, cookie: owner.cookie, documentId, path: versionCollaborationPath({ documentId, sequence }) }),
  ).rejects.toBeInstanceOf(CollaborationRefusedError);
  expect(version).toHaveBeenCalledTimes(1);
  client.close();
  await server.stop();
});

test('a fresh load rejection answers text with 503', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  vi.spyOn(server.services.scheduler, 'version').mockRejectedValue(new Error('boom'));
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  const text = await fetch(`${server.baseUrl}${versionApiPath({ documentId, sequence, resource: VersionResource.Text })}`, {
    headers: { cookie: owner.cookie },
  });
  expect(text.status).toBe(HttpStatus.ServiceUnavailable);
  expect(text.headers.get('retry-after')).toBe('1');
  client.close();
  await server.stop();
});

test('versions without around is 400', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Versions })}`, {
    headers: { cookie: owner.cookie },
  });
  expect(response.status).toBe(HttpStatus.BadRequest);
  await server.stop();
});

function stubbedVersions(version: (request: { documentId: string; sequence: number }) => Promise<unknown>): {
  versions: VersionsService;
  documentId: string;
} {
  const documentId = randomUUID();
  const readModel = { marks: () => [{ sequence: 1, serverTime: 1, minuteStart: 0, isBootstrap: false }] } as unknown as ReadModel;
  return {
    versions: new VersionsService({ readModel, updateLog: unknownSequenceLog, scheduler: { version } as unknown as ProjectionScheduler }),
    documentId,
  };
}

test('peeks that land while a load is in flight log one line when it fails', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let fail: (error: Error) => void = () => undefined;
  const { versions, documentId } = stubbedVersions(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  Array.from({ length: 3 }).forEach(() => versions.peek({ documentId, sequence: 1 }));
  fail(new Error('boom'));
  await expect.poll(() => versions.peek({ documentId, sequence: 1 }).kind).toBe(VersionLookupKind.Failed);
  expect(errors).toHaveBeenCalledTimes(1);
});

test('a stopped projection is not logged as a failed load', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { versions, documentId } = stubbedVersions(() => Promise.reject(new ProjectionStoppedError()));
  versions.peek({ documentId, sequence: 1 });
  await expect.poll(() => versions.peek({ documentId, sequence: 1 }).kind).toBe(VersionLookupKind.Failed);
  expect(errors).not.toHaveBeenCalled();
});

test('a load that completes after forget does not refill the cache', async () => {
  let finish: (reply: unknown) => void = () => undefined;
  const { versions, documentId } = stubbedVersions(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const loading = versions.load({ documentId, sequence: 1 });
  versions.forget(documentId);
  finish({ kind: ProjectionRequestKind.Version, documentId, sequence: 1, serverTime: 1, state: new Uint8Array(1), text: '' });
  await loading;
  expect(versions.peek({ documentId, sequence: 1 }).kind).toBe(VersionLookupKind.Pending);
});
