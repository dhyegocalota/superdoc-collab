import { VERSION_MARK_MS } from '@superdoc-history/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { MigrationSet } from './migrations';
import { projectPending } from './projection';
import { ReadModel } from './read-model';
import { commitBootstrap, openTestDatabase, writeStory } from './testing';
import { UpdateLog } from './update-log';
import { clampToMark, versionSequenceAt, type VersionMarkSummary } from './version-marks';

const DOCUMENT = 'marks-room';
const EDITS = 30;
const BATCH_SIZE = 7;
const SUMMARIES: VersionMarkSummary[] = [
  { sequence: 3, serverTime: 10, minuteStart: 0, isBootstrap: true },
  { sequence: 9, serverTime: 70, minuteStart: 60, isBootstrap: false },
  { sequence: 14, serverTime: 130, minuteStart: 120, isBootstrap: false },
];

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 16, 9, 0) }));
afterEach(() => vi.useRealTimers());

test('keeps the bootstrap mark and one mark per minute', () => {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  const readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const ana = new Y.Doc();
  ana.on('update', (update: Uint8Array) => log.append({ documentName: DOCUMENT, connectionUserId: 'ana', update }));
  writeStory({ document: ana, texts: ['Plan'] });
  commitBootstrap(ana);
  Array.from({ length: EDITS }).forEach((_, index) => {
    vi.advanceTimersByTime(VERSION_MARK_MS / 3);
    writeStory({ document: ana, texts: [`Plan ${'x'.repeat(index)}`] });
  });
  projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  const marks = readModel.marks(DOCUMENT);
  expect(marks.filter((mark) => mark.isBootstrap)).toHaveLength(1);
  const minutes = marks.filter((mark) => !mark.isBootstrap).map((mark) => mark.minuteStart);
  expect(new Set(minutes).size).toBe(minutes.length);
});

test('versionSequenceAt picks the latest mark before the time, else the first', () => {
  expect(versionSequenceAt({ marks: SUMMARIES, time: 75 })).toBe(9);
  expect(versionSequenceAt({ marks: SUMMARIES, time: 5 })).toBe(3);
  expect(versionSequenceAt({ marks: [], time: 5 })).toBeNull();
});

test('clampToMark snaps down and lifts a sequence before the first mark', () => {
  expect(clampToMark({ marks: SUMMARIES, sequence: 12 })?.sequence).toBe(9);
  expect(clampToMark({ marks: SUMMARIES, sequence: 1 })?.sequence).toBe(3);
  expect(clampToMark({ marks: SUMMARIES, sequence: 99 })?.sequence).toBe(14);
});
