import {
  BOOTSTRAP_MS_PER_MEGABYTE,
  BYTES_PER_MEGABYTE,
  BOOTSTRAP_QUEUE_FULL_MESSAGE,
  BOOTSTRAP_QUEUE_WAITING_MESSAGE,
  HEAVY_ROOMS_FULL_MESSAGE,
  HEAVY_ROOMS_USER_CAP_MESSAGE,
  HeavyRoomsRefusal,
  HEAVY_ROOMS_RETRY_AFTER_MS,
  HOUR_MS,
  HttpStatus,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  bootstrapBusyMessage,
  type DocumentSummary,
} from '@superdoc-collab/types';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { DOCUMENT_FILES_DIRECTORY } from '../database/connection';
import { createBlank, docxWithXmlBytes, listOf, upload } from '../testing/document-uploads';
import { pathOf, request } from '../testing/documents-client';
import { signedInOwner, signedInUser, startTestServer, type TestServer, type TestUser } from '../testing/test-server';
import { COMMITTED_WITHOUT_BOOTSTRAP } from '../collaboration/room-bootstrap';

const HEAVY_XML_BYTES = 9.5 * BYTES_PER_MEGABYTE;
const LIGHT_XML_BYTES = 2 * BYTES_PER_MEGABYTE;

test('an owner past the hourly budget of heavy conversions is 429 with the busy message and Retry-After, stores nothing, and a light file or a blank is still served', async () => {
  const server = await startTestServer({ heavyConversionsPerHour: 2 });
  const user = await signedInUser({ server, name: 'Ana' });
  const [first, second, third] = await heavyUploadsOf({ server, user, count: 3 });
  expect([first!.status, second!.status, third!.status]).toEqual([HttpStatus.Created, HttpStatus.Created, HttpStatus.TooManyRequests]);
  expect(await third!.json()).toEqual({ error: bootstrapBusyMessage(HOUR_MS) });
  expect(Number(third!.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(HOUR_MS / SECOND_MS - 5);
  expect((await listOf({ server, cookie: user.cookie })).mine).toHaveLength(2);
  const light = await upload({ server, cookie: user.cookie, bytes: await docxWithXmlBytes(LIGHT_XML_BYTES) });
  const blank = await createBlank({ server, cookie: user.cookie, title: 'Blank' });
  expect([light.status, blank.status]).toEqual([HttpStatus.Created, HttpStatus.Created]);
  await server.stop();
});

const HEAVY_ESTIMATED_MS = (HEAVY_XML_BYTES / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE;

async function heavyUploadsOf({ server, user, count }: { server: TestServer; user: TestUser; count: number }): Promise<Response[]> {
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  vi.spyOn(server.services.runtime, 'bootstrapQueueWaitMs').mockReturnValue(null);
  const bytes = await docxWithXmlBytes(HEAVY_XML_BYTES);
  return Array.from({ length: count }).reduce<Promise<Response[]>>(
    async (answers) => [...(await answers), await upload({ server, cookie: user.cookie, bytes })],
    Promise.resolve([]),
  );
}

test('a heavy upload that would wait past the ceiling is 503 with the predicted wait, stores nothing, and a blank or light create is still served', async () => {
  const server = await startTestServer({ maxBootstrapWaitMs: SECOND_MS });
  const user = await signedInUser({ server, name: 'Ana' });
  const [accepted, refused] = await heavyUploadsOf({ server, user, count: 2 });
  expect([accepted!.status, refused!.status]).toEqual([HttpStatus.Created, HttpStatus.ServiceUnavailable]);
  expect(await refused!.json()).toEqual({ error: bootstrapBusyMessage(HEAVY_ESTIMATED_MS) });
  expect(Number(refused!.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(HEAVY_ESTIMATED_MS / SECOND_MS - 5);
  expect(Number(refused!.headers.get(RETRY_AFTER_HEADER))).toBeLessThanOrEqual(Math.ceil(HEAVY_ESTIMATED_MS / SECOND_MS));
  expect((await listOf({ server, cookie: user.cookie })).mine).toHaveLength(1);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY)).length).toBe(1);
  const blank = await createBlank({ server, cookie: user.cookie, title: 'Blank' });
  const light = await upload({ server, cookie: user.cookie, bytes: await docxWithXmlBytes(LIGHT_XML_BYTES) });
  expect([blank.status, light.status]).toEqual([HttpStatus.Created, HttpStatus.Created]);
  await server.stop();
});

test('heavy uploads wait their turn up to the ceiling and the first one past it is refused', async () => {
  const server = await startTestServer({ maxBootstrapWaitMs: 2 * HEAVY_ESTIMATED_MS });
  const user = await signedInUser({ server, name: 'Ana' });
  const answers = await heavyUploadsOf({ server, user, count: 4 });
  expect(answers.map((answer) => answer.status)).toEqual([
    HttpStatus.Created,
    HttpStatus.Created,
    HttpStatus.Created,
    HttpStatus.ServiceUnavailable,
  ]);
  await server.stop();
});

test('opening a document the server cannot hold as a large room is 503 with Retry-After and its message, and another document opens', async () => {
  const { server, owner } = await signedInOwner();
  vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const heavy: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Heavy' })).json();
  const light: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Light' })).json();
  const refuses = vi.spyOn(server.services.heavyRooms, 'fits').mockImplementation(({ documentId }) => documentId !== heavy.id);
  const refused = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: heavy.id }) });
  expect([refused.status, await refused.json()]).toEqual([HttpStatus.ServiceUnavailable, { error: HEAVY_ROOMS_FULL_MESSAGE }]);
  expect(Number(refused.headers.get(RETRY_AFTER_HEADER))).toBe(HEAVY_ROOMS_RETRY_AFTER_MS / SECOND_MS);
  expect((await request({ server, cookie: owner.cookie, path: pathOf({ documentId: light.id }) })).status).toBe(HttpStatus.Ok);
  refuses.mockReturnValue(true);
  expect((await request({ server, cookie: owner.cookie, path: pathOf({ documentId: heavy.id }) })).status).toBe(HttpStatus.Ok);
  await server.stop();
});

test('a heavy upload is 503 with the large documents message while no room of its size fits, and a light file or a blank is still served', async () => {
  const server = await startTestServer();
  const user = await signedInUser({ server, name: 'Ana' });
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  vi.spyOn(server.services.heavyRooms, 'hasHeadroomFor').mockImplementation(({ documentXmlBytes }) => documentXmlBytes <= LIGHT_XML_BYTES);
  const refused = await upload({ server, cookie: user.cookie, bytes: await docxWithXmlBytes(HEAVY_XML_BYTES) });
  expect([refused.status, await refused.json()]).toEqual([HttpStatus.ServiceUnavailable, { error: HEAVY_ROOMS_FULL_MESSAGE }]);
  expect(Number(refused.headers.get(RETRY_AFTER_HEADER))).toBe(HEAVY_ROOMS_RETRY_AFTER_MS / SECOND_MS);
  expect((await listOf({ server, cookie: user.cookie })).mine).toEqual([]);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY)).length).toBe(0);
  const light = await upload({ server, cookie: user.cookie, bytes: await docxWithXmlBytes(LIGHT_XML_BYTES) });
  const blank = await createBlank({ server, cookie: user.cookie, title: 'Blank' });
  expect([light.status, blank.status]).toEqual([HttpStatus.Created, HttpStatus.Created]);
  await server.stop();
});

test('a stored upload reserves the place its room will need for its owner', async () => {
  const server = await startTestServer();
  const user = await signedInUser({ server, name: 'Ana' });
  const reserve = vi.spyOn(server.services.heavyRooms, 'reserveForUpload');
  const [created] = await heavyUploadsOf({ server, user, count: 1 });
  const { id } = (await created!.json()) as DocumentSummary;
  expect(reserve).toHaveBeenCalledExactlyOnceWith({ documentId: id, userId: user.id });
  await server.stop();
});

test('opening a document past the share of the user is 503 with its own sentence and no Retry-After, while the budget refusal keeps both', async () => {
  const { server, owner } = await signedInOwner();
  vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const heavy: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Heavy' })).json();
  vi.spyOn(server.services.heavyRooms, 'fits').mockReturnValue(false);
  const refusal = vi.spyOn(server.services.heavyRooms, 'refusalOf').mockReturnValue(HeavyRoomsRefusal.UserCap);
  const capped = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: heavy.id }) });
  expect([capped.status, await capped.json(), capped.headers.get(RETRY_AFTER_HEADER)]).toEqual([
    HttpStatus.ServiceUnavailable,
    { error: HEAVY_ROOMS_USER_CAP_MESSAGE },
    null,
  ]);
  expect(refusal).toHaveBeenCalledWith({ documentId: heavy.id, userId: owner.id });
  refusal.mockReturnValue(HeavyRoomsRefusal.Full);
  const full = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: heavy.id }) });
  expect([full.status, await full.json(), full.headers.get(RETRY_AFTER_HEADER)]).toEqual([
    HttpStatus.ServiceUnavailable,
    { error: HEAVY_ROOMS_FULL_MESSAGE },
    String(HEAVY_ROOMS_RETRY_AFTER_MS / SECOND_MS),
  ]);
  await server.stop();
});

test('a second document waiting to be prepared is 429 with a sentence that says the first one is still in line', async () => {
  const server = await startTestServer();
  const user = await signedInUser({ server, name: 'Ana' });
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  const bytes = await docxWithXmlBytes(HEAVY_XML_BYTES);
  const [first, second, third] = [
    await upload({ server, cookie: user.cookie, bytes }),
    await upload({ server, cookie: user.cookie, bytes }),
    await upload({ server, cookie: user.cookie, bytes }),
  ];
  expect([first.status, second.status, third.status]).toEqual([HttpStatus.Created, HttpStatus.Created, HttpStatus.TooManyRequests]);
  expect(await third.json()).toEqual({ error: BOOTSTRAP_QUEUE_FULL_MESSAGE });
  expect(BOOTSTRAP_QUEUE_FULL_MESSAGE).toContain('being prepared');
  expect(BOOTSTRAP_QUEUE_FULL_MESSAGE).toContain('waiting');
  await server.stop();
});

test('a second document waiting while another owner is being prepared is 429 with the sentence about one document waiting', async () => {
  const server = await startTestServer();
  const [ana, bruno] = [await signedInUser({ server, name: 'Ana' }), await signedInUser({ server, name: 'Bruno' })];
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  const bytes = await docxWithXmlBytes(HEAVY_XML_BYTES);
  const [running, waiting, refused] = [
    await upload({ server, cookie: bruno.cookie, bytes }),
    await upload({ server, cookie: ana.cookie, bytes }),
    await upload({ server, cookie: ana.cookie, bytes }),
  ];
  expect([running.status, waiting.status, refused.status]).toEqual([HttpStatus.Created, HttpStatus.Created, HttpStatus.TooManyRequests]);
  expect(await refused.json()).toEqual({ error: BOOTSTRAP_QUEUE_WAITING_MESSAGE });
  await server.stop();
});
