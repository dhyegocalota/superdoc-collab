import { BlockChangeKind, ClientActor, PREVIEW_MAX_CHARACTERS } from '@superdoc-collab/types';
import * as Y from 'yjs';
import { beforeEach, expect, test } from 'vitest';
import { MigrationSet } from './migrations';
import { findBootstrapSequence } from './document-history';
import { projectPending } from './projection';
import { ReadModel } from './read-model';
import { commitBootstrap, openTestDatabase, writeStory } from './testing';
import { UpdateLog } from './update-log';

const DOCUMENT = 'document-1';
const BATCH_SIZE = 3;
const BATCHED_WRITES = 7;
const IMPORTED_AUTHOR = 'Chris Crawford';
let log: UpdateLog;
let readModel: ReadModel;

function author(userId: string): Y.Doc {
  const document = new Y.Doc();
  document.on('update', (update: Uint8Array) =>
    log.append({ documentName: DOCUMENT, connectionUserId: userId, connectionActor: ClientActor.Human, update }),
  );
  return document;
}

function bootstrapped(texts: string[]): Y.Doc {
  const ana = author('ana');
  writeStory({ document: ana, texts });
  commitBootstrap(ana);
  return ana;
}

function events() {
  return readModel.read({ documentName: DOCUMENT, afterSequence: null });
}

function lastLoggedSequence(): number {
  return log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER }).at(-1)!.sequence;
}

beforeEach(() => {
  log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
});

test('projects edits after the bootstrap with the raw identity facts', () => {
  const ana = bootstrapped(['Hello']);
  writeStory({ document: ana, texts: ['Hello world'] });
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(
    events().map(({ kind, inserted, yjsClientIds, connectionUserId }) => ({ kind, inserted, yjsClientIds, connectionUserId })),
  ).toEqual([{ kind: BlockChangeKind.Modified, inserted: ' world', yjsClientIds: [ana.clientID], connectionUserId: 'ana' }]);
});

test('a rewound cursor re-projects without duplicates', () => {
  const ana = bootstrapped(['a']);
  writeStory({ document: ana, texts: ['ab'] });
  writeStory({ document: ana, texts: ['abc'] });
  projectPending({ log, readModel, documentName: DOCUMENT });
  readModel.commit({ documentName: DOCUMENT, events: [], marks: [], lastSequence: events()[0]!.sequence - 1 });
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(events()).toHaveLength(2);
});

test('projects nothing until the bootstrap commits', () => {
  const ana = author('ana');
  writeStory({ document: ana, texts: ['Hello'] });
  expect(projectPending({ log, readModel, documentName: DOCUMENT })).toBeNull();
  expect(events()).toEqual([]);
});

test('projects in batches and resumes from the cursor', () => {
  const ana = bootstrapped(['']);
  Array.from({ length: BATCHED_WRITES }).forEach((_, index) => writeStory({ document: ana, texts: ['x'.repeat(index + 1)] }));
  const cursor = projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  expect(
    events()
      .map((event) => event.inserted)
      .join(''),
  ).toBe('x'.repeat(BATCHED_WRITES));
  expect(cursor).toBe(lastLoggedSequence());
});

test('imported revisions are stored once, with sequence 0 and the revision author', () => {
  const revision = { revisionId: 'r1', authorName: IMPORTED_AUTHOR, serverTime: 1, blockId: 'b0', inserted: 'x', deleted: '' };
  readModel.commitImported({ documentName: DOCUMENT, revisions: [revision] });
  readModel.commitImported({ documentName: DOCUMENT, revisions: [revision] });
  expect(
    events().map(({ imported, authorName, sequence, yjsClientIds, connectionUserId }) => ({
      imported,
      authorName,
      sequence,
      yjsClientIds,
      connectionUserId,
    })),
  ).toEqual([{ imported: true, authorName: IMPORTED_AUTHOR, sequence: 0, yjsClientIds: null, connectionUserId: null }]);
});

test('forgetting a document clears its events and cursor', () => {
  readModel.commit({ documentName: DOCUMENT, events: [], marks: [], lastSequence: 3 });
  readModel.forget(DOCUMENT);
  expect(readModel.cursor(DOCUMENT)).toBeNull();
});

const ABANDONED_CLIENT_ID = 900;
const WINNER_CLIENT_ID = 100;
const META_MAP = 'meta';
const BOOTSTRAP_STATE_KEY = 'bootstrapState';

function loggedChange({ document, userId, change }: { document: Y.Doc; userId: string; change: () => void }): Uint8Array {
  const captured: Uint8Array[] = [];
  document.once('update', (update: Uint8Array) => captured.push(update));
  change();
  const [update] = captured;
  log.append({ documentName: DOCUMENT, connectionUserId: userId, connectionActor: ClientActor.Human, update: update! });
  return update!;
}

test('a commit snapshot starts the projection although a replay of the whole log never sees the commit', () => {
  const abandoned = new Y.Doc();
  abandoned.clientID = ABANDONED_CLIENT_ID;
  loggedChange({ document: abandoned, userId: 'ana', change: () => abandoned.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, 'pending') });
  const winner = new Y.Doc();
  winner.clientID = WINNER_CLIENT_ID;
  loggedChange({ document: winner, userId: 'bruno', change: () => winner.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, 'pending') });
  const committed: Uint8Array[] = [];
  winner.once('update', (update: Uint8Array) => committed.push(update));
  commitBootstrap(winner);
  const { sequence } = log.appendCommitted({
    documentName: DOCUMENT,
    connectionUserId: 'bruno',
    connectionActor: ClientActor.Human,
    update: committed[0]!,
    state: Y.encodeStateAsUpdate(winner),
  });
  expect(findBootstrapSequence({ updates: log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER }) })).toBeNull();
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(readModel.cursor(DOCUMENT)).toBe(sequence);
});

test('the preview is the paragraph texts joined by newlines and follows each batch', () => {
  const ana = bootstrapped(['Hello', 'World']);
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(readModel.previews([DOCUMENT]).get(DOCUMENT)).toBe('Hello\nWorld');
  writeStory({ document: ana, texts: ['Hello', 'World', 'Again'] });
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(readModel.previews([DOCUMENT]).get(DOCUMENT)).toBe('Hello\nWorld\nAgain');
});

test('the preview stops at the maximum number of characters', () => {
  bootstrapped(['x'.repeat(PREVIEW_MAX_CHARACTERS + 50)]);
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(readModel.previews([DOCUMENT]).get(DOCUMENT)).toBe('x'.repeat(PREVIEW_MAX_CHARACTERS));
});
