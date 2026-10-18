import { ReadModel } from '@superdoc-collab/history';
import { commitBootstrap, writeStory } from '@superdoc-collab/history/testing';
import {
  BlockChangeKind,
  ClientActor,
  DocumentResource,
  HttpStatus,
  DocumentRole,
  HttpMethod,
  RETRY_AFTER_HEADER,
  RETRY_AFTER_SECONDS,
  SECOND_MS,
  documentApiPath,
  selectionSummaryApiPath,
  TimelineQueryParam,
  UTC_TIME_ZONE,
  versionApiPath,
  type DocumentTimeline,
  type DocumentTopics,
  type SelectionSummaryView,
  type TopicSummaries,
  type VersionSummary,
} from '@superdoc-collab/types';
import { expect } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { READ_MODEL_DATABASE_FILE } from '../database/connection';
import type { VersionRoomPolicy } from '../collaboration/version-rooms';
import type { LanguageModelChoice } from '../insights/llm-client';
import { connectToDocument, documentWithOwner, memberWithRole, reserveOwner, type CollaborationClient } from './collaboration-client';
import { waitForCommit } from './committed-room';
import { readEvents } from './events-client';
import type { TestServer, TestUser } from './test-server';

const PROJECTION_TIMEOUT_MS = 15_000;
const BULK_CLIENT_ID = 4242;
const BULK_BASE_TIME = Date.UTC(2026, 0, 1);
const DEFAULT_STEP_MS = SECOND_MS;

export function zonedQuery({ query = '', timeZone = UTC_TIME_ZONE }: { query?: string; timeZone?: string } = {}): string {
  const parameters = new URLSearchParams(query);
  parameters.set(TimelineQueryParam.TimeZone, timeZone);
  return parameters.toString();
}

export async function readTimeline({
  server,
  documentId,
  cookie,
  query = '',
  timeZone = UTC_TIME_ZONE,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
  query?: string;
  timeZone?: string;
}): Promise<DocumentTimeline> {
  const response = await fetch(
    `${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?${zonedQuery({ query, timeZone })}`,
    { headers: { cookie } },
  );
  expect(response.ok).toBe(true);
  return response.json();
}

export async function twoAuthorsInTwoBlocks({ languageModel }: { languageModel?: LanguageModelChoice } = {}): Promise<{
  server: TestServer;
  documentId: string;
  owner: TestUser;
  editor: TestUser;
}> {
  const { server, documentId, owner } = await documentWithOwner({ languageModel });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const openClients: { close: () => void }[] = [ownerClient];
  try {
    writeStory({ document: ownerClient.document, texts: ['Budget:', 'Hiring:'] });
    commitBootstrap(ownerClient.document);
    await waitForCommit({ services: server.services, documentId });
    writeStory({ document: ownerClient.document, texts: ['Budget: more money', 'Hiring:'] });
    const editorClient = await connectToDocument({ server, cookie: editor.cookie, documentId });
    openClients.push(editorClient);
    writeStory({ document: editorClient.document, texts: ['Budget: more money', 'Hiring: a designer'] });
    const insertedTexts = async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted);
    await expect.poll(insertedTexts, { timeout: PROJECTION_TIMEOUT_MS }).toEqual(expect.arrayContaining([' more money', ' a designer']));
  } catch (error) {
    openClients.forEach((client) => client.close());
    await server.stop();
    throw error;
  }
  openClients.forEach((client) => client.close());
  return { server, documentId, owner, editor };
}

export function commitBulkEvents({
  server,
  documentId,
  userId,
  count,
  startIndex = 0,
  eventsPerSequence = 1,
  blockCount = 1,
  stepMs = DEFAULT_STEP_MS,
}: {
  server: TestServer;
  documentId: string;
  userId: string;
  count: number;
  startIndex?: number;
  eventsPerSequence?: number;
  blockCount?: number;
  stepMs?: number;
}): void {
  server.services.updateLog.observeClientIdentity({
    documentName: documentId,
    yjsClientId: BULK_CLIENT_ID,
    userId,
    actor: ClientActor.Human,
  });
  const events = Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return {
      sequence: Math.floor(index / eventsPerSequence) + 1,
      serverTime: BULK_BASE_TIME + index * stepMs,
      yjsClientIds: [BULK_CLIENT_ID],
      connectionUserId: userId,
      connectionActor: ClientActor.Human,
      blockId: `b${index % blockCount}`,
      kind: BlockChangeKind.Modified,
      inserted: 'x',
      deleted: '',
    };
  });
  const lastSequence = events.at(-1)!.sequence;
  const sqlite = new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE));
  new ReadModel(sqlite).commit({ documentName: documentId, events, marks: [], lastSequence });
  sqlite.close();
}

export async function storyWithBlocks({
  languageModel,
  texts,
}: {
  languageModel?: LanguageModelChoice;
  texts: string[];
}): Promise<{ server: TestServer; documentId: string; owner: TestUser; client: CollaborationClient }> {
  const { server, documentId, owner } = await documentWithOwner({ languageModel });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts });
  commitBootstrap(client.document);
  await waitForCommit({ services: server.services, documentId });
  writeStory({ document: client.document, texts: texts.map((text, index) => (index === texts.length - 1 ? `${text} ` : text)) });
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).length, { timeout: PROJECTION_TIMEOUT_MS })
    .toBeGreaterThan(0);
  return { server, documentId, owner, client };
}

export async function readTopics({
  server,
  documentId,
  cookie,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
}): Promise<DocumentTopics> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Topics })}`, {
    headers: { cookie },
  });
  expect(response.ok).toBe(true);
  return response.json();
}

export async function readSelectionSummary({
  server,
  documentId,
  cookie,
  query = '',
  timeZone = UTC_TIME_ZONE,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
  query?: string;
  timeZone?: string;
}): Promise<SelectionSummaryView> {
  const response = await fetch(`${server.baseUrl}${selectionSummaryApiPath(documentId)}?${zonedQuery({ query, timeZone })}`, {
    headers: { cookie },
  });
  expect(response.ok).toBe(true);
  return response.json();
}

export function postSelectionSummary({
  server,
  documentId,
  cookie,
  query = '',
  timeZone = UTC_TIME_ZONE,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
  query?: string;
  timeZone?: string;
}): Promise<Response> {
  return fetch(`${server.baseUrl}${selectionSummaryApiPath(documentId)}?${zonedQuery({ query, timeZone })}`, {
    method: HttpMethod.Post,
    headers: { cookie, origin: server.baseUrl },
  });
}

export async function readSummaries({
  server,
  documentId,
  cookie,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
}): Promise<TopicSummaries> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Summaries })}`, {
    headers: { cookie },
  });
  expect(response.ok).toBe(true);
  return response.json();
}

const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_RANGE = 4294967296;

export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + MULBERRY_INCREMENT) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / MULBERRY_RANGE;
  };
}

export async function readJson<Body>({ server, cookie, path }: { server: TestServer; cookie: string; path: string }): Promise<Body> {
  const response = await fetch(`${server.baseUrl}${path}`, { headers: { cookie } });
  expect(response.ok).toBe(true);
  return response.json();
}

const ANOTHER_DOCUMENT_TITLE = 'Another';
const ORIGINAL_TEXT = 'Original';
const EDITED_TEXT = 'Original edited';
const RETRY_AFTER_SECONDS_TEXT = String(RETRY_AFTER_SECONDS);

export async function editedAfterBootstrap({ versionRoomPolicy }: { versionRoomPolicy?: VersionRoomPolicy } = {}): Promise<{
  server: TestServer;
  documentId: string;
  owner: TestUser;
  client: CollaborationClient;
  bootstrapText: string;
  editedText: string;
}> {
  const { server, documentId, owner } = await documentWithOwner({ versionRoomPolicy });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [ORIGINAL_TEXT] });
  commitBootstrap(client.document);
  await waitForCommit({ services: server.services, documentId });
  writeStory({ document: client.document, texts: [EDITED_TEXT] });
  await expect
    .poll(() => server.services.readModel.marks(documentId).some((mark) => !mark.isBootstrap), { timeout: PROJECTION_TIMEOUT_MS })
    .toBe(true);
  return { server, documentId, owner, client, bootstrapText: ORIGINAL_TEXT, editedText: EDITED_TEXT };
}

export async function bootstrappedDocument({
  server,
  owner,
}: {
  server: TestServer;
  owner: TestUser;
}): Promise<{ documentId: string; sequence: number }> {
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: ANOTHER_DOCUMENT_TITLE, ownerUserId: owner.id });
  reserveOwner({ server, documentId, owner });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [ORIGINAL_TEXT] });
  commitBootstrap(client.document);
  await expect.poll(() => server.services.readModel.marks(documentId).length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(0);
  client.close();
  return { documentId, sequence: server.services.readModel.marks(documentId)[0]!.sequence };
}

export async function pollVersion({
  server,
  cookie,
  documentId,
  sequence,
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
  sequence: number;
}): Promise<VersionSummary> {
  const request = () => fetch(`${server.baseUrl}${versionApiPath({ documentId, sequence })}`, { headers: { cookie } });
  await expect
    .poll(
      async () => {
        const response = await request();
        if (response.status === HttpStatus.Accepted) expect(response.headers.get(RETRY_AFTER_HEADER)).toBe(RETRY_AFTER_SECONDS_TEXT);
        return response.status;
      },
      { timeout: PROJECTION_TIMEOUT_MS },
    )
    .toBe(HttpStatus.Ok);
  return (await request()).json();
}
