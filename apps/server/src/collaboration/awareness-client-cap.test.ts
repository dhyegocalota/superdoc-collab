import type { Document } from '@hocuspocus/server';
import { MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { overfullConnections } from './awareness-client-cap';

function documentWith(clientCounts: number[]): Document {
  return {
    name: 'document-1',
    connections: new Map(
      clientCounts.map((count, index) => [index, { clients: new Set(Array.from({ length: count }, (_, id) => id + index * 1000)) }]),
    ),
  } as unknown as Document;
}

test('a connection holding exactly the cap of client ids is not overfull', () => {
  expect(overfullConnections(documentWith([MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION]))).toEqual([]);
});

test('a connection holding one id more than the cap is overfull and its neighbours are not', () => {
  const overfull = overfullConnections(documentWith([1, MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION + 1, 2]));
  expect(overfull.map(({ clients }) => clients.size)).toEqual([MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION + 1]);
});
