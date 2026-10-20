import { ClientActor, VERSION_MARK_MS } from '@superdoc-collab/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { MigrationSet } from './migrations';
import { projectPending } from './projection';
import { ReadModel } from './read-model';
import { commitBootstrap, openTestDatabase, writeStory } from './testing';
import { readMainStoryText } from './document-content';
import { compact, UpdateLog, replay } from './update-log';
import { versionAt } from './version-state';

const DOCUMENT = 'version-room';
const EDITS = 30;
const BATCH_SIZE = 7;
const DELETE_ROUNDS = 40;
const INSERTED_PER_ROUND = 200;
const DELETED_PER_ROUND = 190;
const RANDOM_ROUNDS = 60;
const RANDOM_SEED = 20261016;
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 2 ** 32;
const MAX_RANDOM_LENGTH = 40;
const START_TIME = Date.UTC(2026, 9, 16, 9, 0);
const STEP_MS = 2000;

function bootstrappedLog(texts: string[]): { log: UpdateLog; readModel: ReadModel; ana: Y.Doc } {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  const readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const ana = new Y.Doc();
  ana.on('update', (update: Uint8Array) =>
    log.append({ documentName: DOCUMENT, connectionUserId: 'ana', connectionActor: ClientActor.Human, update }),
  );
  writeStory({ document: ana, texts });
  commitBootstrap(ana);
  return { log, readModel, ana };
}

function expectEveryMarkRestored({ log, readModel }: { log: UpdateLog; readModel: ReadModel }): void {
  readModel.marks(DOCUMENT).forEach(({ sequence }) => {
    const restored = versionAt({ log, documentName: DOCUMENT, sequence });
    const expected = replay(log.read({ documentName: DOCUMENT, untilSequence: sequence }));
    expect(restored.getMap('content').toJSON()).toEqual(expected.getMap('content').toJSON());
    expect(restored.getText('draft').toString()).toBe(expected.getText('draft').toString());
  });
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return state / LCG_MODULUS;
  };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: START_TIME }));
afterEach(() => vi.useRealTimers());

test('every mark restores the document exactly as a full replay at its sequence', () => {
  const { log, readModel, ana } = bootstrappedLog(['Plan']);
  Array.from({ length: EDITS }).forEach((_, index) => {
    vi.advanceTimersByTime(VERSION_MARK_MS / 3);
    writeStory({ document: ana, texts: [`Plan ${'x'.repeat(index)}`, index % 4 === 0 ? '' : `Note ${index}`] });
  });
  projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  expect(readModel.marks(DOCUMENT).length).toBeGreaterThan(EDITS / 3);
  expectEveryMarkRestored({ log, readModel });
});

test('a delete-heavy history restores exactly at every mark', () => {
  const { log, readModel, ana } = bootstrappedLog(['Plan']);
  const draft = ana.getText('draft');
  Array.from({ length: DELETE_ROUNDS }).forEach((_, round) => {
    vi.advanceTimersByTime(VERSION_MARK_MS / 2);
    draft.insert(0, 'x'.repeat(INSERTED_PER_ROUND));
    draft.delete(0, DELETED_PER_ROUND);
    writeStory({ document: ana, texts: [`Plan ${round}`] });
  });
  projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  expectEveryMarkRestored({ log, readModel });
});

test('a seeded random history restores exactly at every mark', () => {
  const { log, readModel, ana } = bootstrappedLog(['Plan']);
  const draft = ana.getText('draft');
  const random = seededRandom(RANDOM_SEED);
  Array.from({ length: RANDOM_ROUNDS }).forEach(() => {
    vi.advanceTimersByTime(Math.floor(random() * VERSION_MARK_MS));
    const length = draft.length;
    const position = Math.floor(random() * (length + 1));
    const inserted = 'abc'.repeat(Math.floor(random() * MAX_RANDOM_LENGTH));
    draft.insert(position, inserted);
    draft.delete(Math.floor(random() * draft.length), Math.floor(random() * MAX_RANDOM_LENGTH));
    writeStory({ document: ana, texts: [`Plan ${Math.floor(random() * LCG_MODULUS)}`] });
  });
  projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  expectEveryMarkRestored({ log, readModel });
});

function expectEveryLoggedSequenceRestored(log: UpdateLog): void {
  log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER }).forEach(({ sequence }) => {
    const restored = versionAt({ log, documentName: DOCUMENT, sequence });
    const expected = replay(log.read({ documentName: DOCUMENT, untilSequence: sequence }));
    expect(restored.getMap('content').toJSON()).toEqual(expected.getMap('content').toJSON());
  });
}

test('the version at the sequence of an edit shows the edit after a later delete in the same minute', () => {
  const { log, ana } = bootstrappedLog(['Plan']);
  vi.advanceTimersByTime(STEP_MS);
  writeStory({ document: ana, texts: ['Plan', 'Added'] });
  vi.advanceTimersByTime(STEP_MS);
  writeStory({ document: ana, texts: ['Plan', 'Added and edited'] });
  vi.advanceTimersByTime(STEP_MS);
  writeStory({ document: ana, texts: ['Plan'] });
  const sequences = log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER }).map(({ sequence }) => sequence);
  const editSequence = sequences.at(-2)!;
  const version = versionAt({ log, documentName: DOCUMENT, sequence: editSequence });
  expect(readMainStoryText(version)).toBe('PlanAdded and edited');
});

test('every logged sequence restores exactly as a full replay, deletes included', () => {
  const { log, ana } = bootstrappedLog(['Plan']);
  const draft = ana.getText('draft');
  Array.from({ length: DELETE_ROUNDS }).forEach((_, round) => {
    vi.advanceTimersByTime(STEP_MS);
    draft.insert(0, 'x'.repeat(INSERTED_PER_ROUND));
    draft.delete(0, DELETED_PER_ROUND);
    writeStory({ document: ana, texts: ['Plan', round % 2 === 0 ? `Line ${round}` : ''] });
  });
  expectEveryLoggedSequenceRestored(log);
});

const SNAPSHOT_EVERY_UPDATES = 5;
const TAIL_UPDATES = 3;

test('a version after a compaction snapshot reads only the tail and still equals a full replay', () => {
  const { log, ana } = bootstrappedLog(['Plan']);
  const draft = ana.getText('draft');
  Array.from({ length: SNAPSHOT_EVERY_UPDATES * 2 + TAIL_UPDATES }).forEach((_, round) => {
    vi.advanceTimersByTime(STEP_MS);
    draft.insert(0, 'x'.repeat(INSERTED_PER_ROUND));
    draft.delete(0, DELETED_PER_ROUND);
    writeStory({ document: ana, texts: ['Plan', round % 2 === 0 ? `Line ${round}` : ''] });
  });
  compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY_UPDATES });
  const sequence = log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER }).at(-2)!.sequence;
  const snapshotSequence = log.latestSnapshot({ documentName: DOCUMENT, atOrBefore: sequence })!.sequence;
  const readRange = vi.spyOn(log, 'readRange');
  const restored = versionAt({ log, documentName: DOCUMENT, sequence });
  const versionRead = readRange.mock.calls.find(([range]) => range.untilSequence === sequence)!;
  expect(versionRead[0].afterSequence).toBe(snapshotSequence);
  const expected = replay(log.read({ documentName: DOCUMENT, untilSequence: sequence }));
  expect(restored.getMap('content').toJSON()).toEqual(expected.getMap('content').toJSON());
  expectEveryLoggedSequenceRestored(log);
});

test('a version never reads the log past its sequence', () => {
  const { log, ana } = bootstrappedLog(['Plan']);
  Array.from({ length: EDITS }).forEach((_, index) => writeStory({ document: ana, texts: [`Plan ${index}`] }));
  const sequence = log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER }).at(-EDITS)!.sequence;
  const readRange = vi.spyOn(log, 'readRange');
  versionAt({ log, documentName: DOCUMENT, sequence });
  expect(readRange.mock.calls.map(([range]) => range.untilSequence)).toEqual([sequence]);
});
