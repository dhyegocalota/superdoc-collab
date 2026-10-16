import { ReadModel } from '@superdoc-history/history';
import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import { BlockChangeKind, DocumentResource, DocumentRole, documentApiPath, versionApiPath, type DocumentTimeline, type DocumentTopics, type TopicSummaries, type VersionSummary } from '@superdoc-history/types';
import { expect } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { READ_MODEL_DATABASE_FILE } from '../database/connection';
import type { VersionRoomPolicy } from '../collaboration/version-rooms';
import type { LanguageModelChoice } from '../insights/llm-client';
import { connectToDocument, documentWithOwner, memberWithRole, type CollaborationClient } from './collaboration-client';
import { readEvents } from './events-client';
import type { TestServer, TestUser } from './test-server';

const PROJECTION_TIMEOUT_MS = 15_000;
const BULK_CLIENT_ID = 4242;
const BULK_BASE_TIME = Date.UTC(2026, 0, 1);
const DEFAULT_STEP_MS = 1000;

export async function readTimeline({ server, documentId, cookie, query = '' }: { server: TestServer; documentId: string; cookie: string; query?: string }): Promise<DocumentTimeline> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?${query}`, { headers: { cookie } });
  expect(response.ok).toBe(true);
  return response.json();
}

export async function twoAuthorsInTwoBlocks(): Promise<{ server: TestServer; documentId: string; owner: TestUser; editor: TestUser }> {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const openClients: { close: () => void }[] = [ownerClient];
  try {
    writeStory({ document: ownerClient.document, texts: ['Budget:', 'Hiring:'] });
    commitBootstrap(ownerClient.document);
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

export function commitBulkEvents({ server, documentId, userId, count, startIndex = 0, eventsPerSequence = 1, blockCount = 1, stepMs = DEFAULT_STEP_MS }: { server: TestServer; documentId: string; userId: string; count: number; startIndex?: number; eventsPerSequence?: number; blockCount?: number; stepMs?: number }): void {
  server.services.log.observeClientIdentity({ documentName: documentId, yjsClientId: BULK_CLIENT_ID, userId });
  const events = Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return { sequence: Math.floor(index / eventsPerSequence) + 1, serverTime: BULK_BASE_TIME + index * stepMs, yjsClientIds: [BULK_CLIENT_ID], connectionUserId: userId, blockId: `b${index % blockCount}`, kind: BlockChangeKind.Modified, inserted: 'x', deleted: '' };
  });
  const lastSequence = events.at(-1)!.sequence;
  const sqlite = new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE));
  new ReadModel(sqlite).commit({ documentName: documentId, events, marks: [], lastSequence });
  sqlite.close();
}

export async function storyWithBlocks({ languageModel, texts }: { languageModel?: LanguageModelChoice; texts: string[] }): Promise<{ server: TestServer; documentId: string; owner: TestUser; client: CollaborationClient }> {
  const { server, documentId, owner } = await documentWithOwner({ languageModel });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: texts.map((text, index) => (index === texts.length - 1 ? `${text} ` : text)) });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(0);
  return { server, documentId, owner, client };
}

export async function readTopics({ server, documentId, cookie }: { server: TestServer; documentId: string; cookie: string }): Promise<DocumentTopics> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Topics })}`, { headers: { cookie } });
  expect(response.ok).toBe(true);
  return response.json();
}

export async function readSummaries({ server, documentId, cookie }: { server: TestServer; documentId: string; cookie: string }): Promise<TopicSummaries> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Summaries })}`, { headers: { cookie } });
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

const VERSION_POLL_INTERVAL_MS = 50;
const ORIGINAL_TEXT = 'Original';
const EDITED_TEXT = 'Original edited';
const RETRY_AFTER_SECONDS_TEXT = '1';

export async function editedAfterBootstrap({ versionRoomPolicy }: { versionRoomPolicy?: VersionRoomPolicy } = {}) {
  const { server, documentId, owner } = await documentWithOwner({ versionRoomPolicy });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [ORIGINAL_TEXT] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: [EDITED_TEXT] });
  await expect.poll(() => server.services.readModel.marks(documentId).some((mark) => !mark.isBootstrap), { timeout: PROJECTION_TIMEOUT_MS }).toBe(true);
  return { server, documentId, owner, client, bootstrapText: ORIGINAL_TEXT, editedText: EDITED_TEXT };
}

export async function bootstrappedDocument({ server, owner }: { server: TestServer; owner: TestUser }): Promise<{ documentId: string; sequence: number }> {
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: 'Another', ownerUserId: owner.id });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [ORIGINAL_TEXT] });
  commitBootstrap(client.document);
  await expect.poll(() => server.services.readModel.marks(documentId).length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(0);
  client.close();
  return { documentId, sequence: server.services.readModel.marks(documentId)[0]!.sequence };
}

export async function pollVersion({ server, cookie, documentId, sequence }: { server: TestServer; cookie: string; documentId: string; sequence: number }): Promise<VersionSummary> {
  const response = await fetch(`${server.baseUrl}${versionApiPath({ documentId, sequence })}`, { headers: { cookie } });
  if (response.ok && response.status === 200) return response.json();
  expect(response.status).toBe(202);
  expect(response.headers.get('retry-after')).toBe(RETRY_AFTER_SECONDS_TEXT);
  await response.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, VERSION_POLL_INTERVAL_MS));
  return pollVersion({ server, cookie, documentId, sequence });
}
