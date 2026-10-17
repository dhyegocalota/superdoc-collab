import type { StoredEditEvent } from '@superdoc-collab/history';
import { BlockChangeKind, ClientActor } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { resolveEvents, type ResolvedEventsServices } from './resolved-events';

const DOCUMENT = 'document-1';
const ANA = 'user-ana';
const ANA_CLIENT_ID = 7;
const IMPORTED_AUTHOR = 'Chris Crawford';

function storedEvent(overrides: Partial<StoredEditEvent>): StoredEditEvent {
  return {
    id: 1,
    sequence: 1,
    serverTime: 1,
    yjsClientIds: [ANA_CLIENT_ID],
    connectionUserId: ANA,
    connectionActor: ClientActor.Human,
    authorName: null,
    blockId: 'block',
    kind: BlockChangeKind.Modified,
    inserted: 'x',
    deleted: '',
    imported: false,
    ...overrides,
  };
}

function servicesWith(actor: ClientActor): ResolvedEventsServices {
  return {
    updateLog: { clientIdentities: () => new Map([[ANA_CLIENT_ID, { userId: ANA, actor }]]) },
    documents: { userNames: () => new Map([[ANA, 'Ana']]) },
  };
}

test.each([
  [ClientActor.Human, 'Ana'],
  [ClientActor.Agent, 'Ana'],
])('an event written by a %s resolves to the author named %s', (actor, name) => {
  const [event] = resolveEvents({ services: servicesWith(actor), documentId: DOCUMENT, stored: [storedEvent({ connectionActor: actor })] });
  expect(event!.authors).toEqual([{ id: ANA, name, actor }]);
});

test('an imported revision resolves to a human author without an id', () => {
  const stored = storedEvent({ imported: true, yjsClientIds: null, connectionUserId: null, authorName: IMPORTED_AUTHOR });
  const [event] = resolveEvents({ services: servicesWith(ClientActor.Human), documentId: DOCUMENT, stored: [stored] });
  expect(event!.authors).toEqual([{ id: null, name: IMPORTED_AUTHOR, actor: ClientActor.Human }]);
});
