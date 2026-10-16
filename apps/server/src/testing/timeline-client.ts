import { ReadModel } from '@superdoc-history/history';
import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import { BlockChangeKind, DocumentResource, DocumentRole, documentApiPath, type DocumentTimeline } from '@superdoc-history/types';
import { expect } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { READ_MODEL_DATABASE_FILE } from '../database/connection';
import { connectToDocument, documentWithOwner, memberWithRole } from './collaboration-client';
import { readEvents } from './events-client';
import type { TestServer } from './test-server';

const PROJECTION_TIMEOUT_MS = 15_000;
const BULK_CLIENT_ID = 4242;
const BULK_BASE_TIME = Date.UTC(2026, 0, 1);
const DEFAULT_STEP_MS = 1000;

export async function readTimeline({ server, documentId, cookie, query = '' }: { server: TestServer; documentId: string; cookie: string; query?: string }): Promise<DocumentTimeline> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?${query}`, { headers: { cookie } });
  expect(response.ok).toBe(true);
  return response.json();
}

export async function twoAuthorsInTwoBlocks() {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: ownerClient.document, texts: ['Budget:', 'Hiring:'] });
  commitBootstrap(ownerClient.document);
  writeStory({ document: ownerClient.document, texts: ['Budget: more money', 'Hiring:'] });
  const editorClient = await connectToDocument({ server, cookie: editor.cookie, documentId });
  writeStory({ document: editorClient.document, texts: ['Budget: more money', 'Hiring: a designer'] });
  const insertedTexts = async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted);
  await expect.poll(insertedTexts, { timeout: PROJECTION_TIMEOUT_MS }).toEqual(expect.arrayContaining([' more money', ' a designer']));
  [ownerClient, editorClient].forEach((client) => client.close());
  return { server, documentId, owner, editor };
}

export function commitBulkEvents({ server, documentId, userId, count, startIndex = 0, eventsPerSequence = 1, blockCount = 1, stepMs = DEFAULT_STEP_MS }: { server: TestServer; documentId: string; userId: string; count: number; startIndex?: number; eventsPerSequence?: number; blockCount?: number; stepMs?: number }): number {
  server.services.log.observeClientIdentity({ documentName: documentId, yjsClientId: BULK_CLIENT_ID, userId });
  const events = Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return { sequence: Math.floor(index / eventsPerSequence) + 1, serverTime: BULK_BASE_TIME + index * stepMs, yjsClientIds: [BULK_CLIENT_ID], connectionUserId: userId, blockId: `b${index % blockCount}`, kind: BlockChangeKind.Modified, inserted: 'x', deleted: '' };
  });
  const lastSequence = events.at(-1)!.sequence;
  const sqlite = new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE));
  new ReadModel(sqlite).commit({ documentName: documentId, events, marks: [], lastSequence });
  sqlite.close();
  return lastSequence;
}
