import type { Document } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-collab/history';
import { ClientActor } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createClientDeclarer } from './client-declarations';

const DOCUMENT_ID = 'document-1';

type FakeConnection = { userId: string; clients: number[]; readOnly?: boolean; actor?: ClientActor };

function fakeDocument(connections: FakeConnection[]): Document {
  const states = new Map(
    connections.flatMap(({ userId, clients }) => clients.map((clientId): [number, { userId: string }] => [clientId, { userId }])),
  );
  return {
    name: DOCUMENT_ID,
    awareness: { getStates: () => states },
    connections: new Map(
      connections.map(({ userId, clients, readOnly = false, actor = ClientActor.Human }, index) => [
        index,
        { clients: new Set(clients), connection: { readOnly, context: { userId, documentId: DOCUMENT_ID, actor } } },
      ]),
    ),
  } as unknown as Document;
}

function declaredBy(connections: FakeConnection[]): string[] {
  const declareClientIdentity = vi.fn();
  createClientDeclarer({ declareClientIdentity } as unknown as UpdateLog).declare(fakeDocument(connections));
  return declareClientIdentity.mock.calls.map(([{ yjsClientId, userId }]) => `${yjsClientId}:${userId}`);
}

const MANY_CLIENT_IDS = 100_000;
const BOUNDED_DECLARE_TIMEOUT_MS = 2_000;

test('a connection holding many client ids is declared in linear time', { timeout: BOUNDED_DECLARE_TIMEOUT_MS }, () => {
  const clients = Array.from({ length: MANY_CLIENT_IDS }, (_, index) => index + 1);
  expect(declaredBy([{ userId: 'ana', clients }])).toHaveLength(MANY_CLIENT_IDS);
});

test('a writable connection declares the clients that carry its user id', () => {
  expect(declaredBy([{ userId: 'ana', clients: [1] }])).toEqual(['1:ana']);
});

test('an agent connection declares nothing', () => {
  expect(declaredBy([{ userId: 'ana', clients: [1], actor: ClientActor.Agent }])).toEqual([]);
});

test('a human declaration carries the human actor', () => {
  const declareClientIdentity = vi.fn();
  createClientDeclarer({ declareClientIdentity } as unknown as UpdateLog).declare(fakeDocument([{ userId: 'ana', clients: [1] }]));
  expect(declareClientIdentity).toHaveBeenCalledWith({
    documentName: DOCUMENT_ID,
    yjsClientId: 1,
    userId: 'ana',
    actor: ClientActor.Human,
  });
});

test('a read-only connection declares nothing', () => {
  expect(declaredBy([{ userId: 'ana', clients: [1], readOnly: true }])).toEqual([]);
});

test('a client id held by two connections is declared by neither', () => {
  expect(
    declaredBy([
      { userId: 'ana', clients: [1, 2] },
      { userId: 'bruno', clients: [1] },
    ]),
  ).toEqual(['2:ana']);
});
