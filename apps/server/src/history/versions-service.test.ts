import type { ReadModel, UpdateLog } from '@superdoc-collab/history';
import { LARGE_ROOM_STATE_BYTES, LARGE_VERSION_LOAD_WEIGHT, VERSION_LOADS_PER_MINUTE } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import type { ProjectionScheduler } from './projection-scheduler';
import { keysOfDocument, marksAround, VERSION_MARKS_AROUND, VersionsService, VersionThrottledError } from './versions-service';

const MARK_COUNT = 30;
const marks = Array.from({ length: MARK_COUNT }, (_, index) => ({
  sequence: (index + 1) * 10,
  serverTime: index,
  minuteStart: 0,
  isBootstrap: false,
}));

test('keysOfDocument keeps only the keys of that document', () => {
  expect(keysOfDocument({ keys: ['d1/1', 'd10/1', 'd1/20'], documentId: 'd1' })).toEqual(['d1/1', 'd1/20']);
});

test('marksAround centres on the last mark at or before the sequence', () => {
  expect(marksAround({ marks, sequence: 155 }).map((mark) => mark.sequence)).toEqual(
    marks.slice(14 - VERSION_MARKS_AROUND, 14 + VERSION_MARKS_AROUND + 1).map((mark) => mark.sequence),
  );
});

test('marksAround before the first mark starts at the first mark', () => {
  expect(marksAround({ marks, sequence: 0 })).toEqual(marks.slice(0, VERSION_MARKS_AROUND + 1));
});

const DOCUMENT_ID = 'document-1';
const USER_ID = 'ana';
const FIRST_LOADED_SEQUENCE = 2;

function serviceOver(documentBytes: number): VersionsService {
  const readModel = { marks: () => [{ sequence: 1, serverTime: 1, minuteStart: 0, isBootstrap: true }] } as unknown as ReadModel;
  const updateLog = { serverTimeOf: () => 1, byteLength: () => documentBytes } as unknown as UpdateLog;
  const scheduler = {
    refusesVersion: () => false,
    version: async () => ({ serverTime: 1, state: new Uint8Array(), text: '' }),
  } as unknown as ProjectionScheduler;
  return new VersionsService({ readModel, updateLog, scheduler });
}

async function loadsBeforeThrottle(service: VersionsService): Promise<number> {
  const outcomes = await Array.from({ length: VERSION_LOADS_PER_MINUTE + 1 }, (_, index) => FIRST_LOADED_SEQUENCE + index).reduce(
    async (previous, sequence) => {
      const settled = await previous;
      const outcome = await service.load({ documentId: DOCUMENT_ID, sequence, userId: USER_ID }).then(
        () => true,
        (error) => !(error instanceof VersionThrottledError),
      );
      return [...settled, outcome];
    },
    Promise.resolve<boolean[]>([]),
  );
  return outcomes.filter(Boolean).length;
}

test('a user loads the full minute budget of versions of a small document', async () => {
  expect(await loadsBeforeThrottle(serviceOver(LARGE_ROOM_STATE_BYTES))).toBe(VERSION_LOADS_PER_MINUTE);
});

test('a version of a large document spends several loads of the minute budget', async () => {
  expect(await loadsBeforeThrottle(serviceOver(LARGE_ROOM_STATE_BYTES + 1))).toBe(
    Math.ceil(VERSION_LOADS_PER_MINUTE / LARGE_VERSION_LOAD_WEIGHT),
  );
});
