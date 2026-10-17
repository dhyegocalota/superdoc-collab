import type { Document } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-collab/history';
import { expect, test, vi } from 'vitest';
import { createClientDeclarer } from './client-declarations';

const DOCUMENT_ID = 'document-1';

type FakeConnection = { userId: string; clients: number[]; readOnly?: boolean };

function fakeDocument(connections: FakeConnection[]): Document {
  const states = new Map(
    connections.flatMap(({ userId, clients }) => clients.map((clientId): [number, { userId: string }] => [clientId, { userId }])),
  );
  return {
    name: DOCUMENT_ID,
    awareness: { getStates: () => states },
    connections: new Map(
      connections.map(({ userId, clients, readOnly = false }, index) => [
        index,
        { clients: new Set(clients), connection: { readOnly, context: { userId, documentId: DOCUMENT_ID } } },
      ]),
    ),
  } as unknown as Document;
}

function declaredBy(connections: FakeConnection[]): string[] {
  const declareClientIdentity = vi.fn();
  createClientDeclarer({ declareClientIdentity } as unknown as UpdateLog).declare(fakeDocument(connections));
  return declareClientIdentity.mock.calls.map(([{ yjsClientId, userId }]) => `${yjsClientId}:${userId}`);
}

test('a writable connection declares the clients that carry its user id', () => {
  expect(declaredBy([{ userId: 'ana', clients: [1] }])).toEqual(['1:ana']);
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
