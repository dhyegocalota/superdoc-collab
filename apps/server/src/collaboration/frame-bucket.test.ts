import { expect, test, vi } from 'vitest';
import {
  authFrame,
  awarenessFrame,
  awarenessFrameClaiming,
  PaddedVarintField,
  paddedAwarenessFrame,
  syncStepOneFrame,
} from '../testing/socket-frames';
import { awarenessEntriesOf, awarenessEntryCountOf, FrameBucket, frameBucketOf, UNREADABLE_ENTRY_COUNT } from './frame-bucket';

const ROOM_NAME = 'superdoc-room-1';
const SINGLE_BYTE_FRAME = Buffer.from([0]);
const NAME_LONGER_THAN_FRAME = Buffer.from([50, 1, 2]);

test('an awareness frame is counted in the awareness bucket', () => {
  expect(frameBucketOf(awarenessFrame(ROOM_NAME))).toBe(FrameBucket.Awareness);
});

test('sync and auth frames are counted with the updates', () => {
  expect([frameBucketOf(syncStepOneFrame(ROOM_NAME)), frameBucketOf(authFrame(ROOM_NAME))]).toEqual([
    FrameBucket.Updates,
    FrameBucket.Updates,
  ]);
});

test('an unparseable frame is counted with the updates', () => {
  expect([frameBucketOf(SINGLE_BYTE_FRAME), frameBucketOf(NAME_LONGER_THAN_FRAME), frameBucketOf(Buffer.alloc(0))]).toEqual([
    FrameBucket.Updates,
    FrameBucket.Updates,
    FrameBucket.Updates,
  ]);
});

const LONG_ROOM_NAME = 'r'.repeat(300);

test('a room name long enough to need a multi-byte length is still read', () => {
  expect([frameBucketOf(awarenessFrame(LONG_ROOM_NAME)), frameBucketOf(syncStepOneFrame(LONG_ROOM_NAME))]).toEqual([
    FrameBucket.Awareness,
    FrameBucket.Updates,
  ]);
});

test('a frame delivered as fragments or an array buffer is read the same way', () => {
  const frame = awarenessFrame(ROOM_NAME);
  const arrayBuffer = new ArrayBuffer(frame.length);
  new Uint8Array(arrayBuffer).set(frame);
  const fragments = [frame.subarray(0, 4), frame.subarray(4)];
  expect([frameBucketOf(fragments), frameBucketOf(arrayBuffer)]).toEqual([FrameBucket.Awareness, FrameBucket.Awareness]);
});

const ENTRY_COUNT_ROOM_NAME_BYTES = 1 + ROOM_NAME.length;
const MESSAGE_TYPE_BYTES = 1;
const LENGTH_BYTES = 1;
const FIRST_CLAIMED_ID = 7;
const UNTERMINATED_VARINT = Buffer.alloc(5, 0x80);

function claimingFrame({ roomName = ROOM_NAME, count }: { roomName?: string; count: number }): Buffer {
  return awarenessFrameClaiming({ roomName, clientIds: Array.from({ length: count }, (_, index) => FIRST_CLAIMED_ID + index) });
}

test('the entry count of an awareness frame is the count the payload declares', () => {
  expect([0, 1, 9, 300].map((count) => awarenessEntryCountOf(claimingFrame({ count })))).toEqual([0, 1, 9, 300]);
  expect(awarenessEntryCountOf(awarenessFrame(ROOM_NAME))).toBe(0);
});

test('the entry count is read behind a multi-byte room name length and payload length', () => {
  expect(awarenessEntryCountOf(claimingFrame({ roomName: LONG_ROOM_NAME, count: 20 }))).toBe(20);
});

test('the entry count of a frame delivered as fragments is read the same way', () => {
  const frame = claimingFrame({ count: 9 });
  expect(awarenessEntryCountOf([frame.subarray(0, 4), frame.subarray(4)])).toBe(9);
});

test('a frame that is not awareness has no entry count', () => {
  expect([syncStepOneFrame(ROOM_NAME), authFrame(ROOM_NAME)].map(awarenessEntryCountOf)).toEqual([null, null]);
});

test('a truncated or unterminated count has no entry count', () => {
  const frame = claimingFrame({ count: 1 });
  const afterType = ENTRY_COUNT_ROOM_NAME_BYTES + MESSAGE_TYPE_BYTES;
  const afterLength = afterType + LENGTH_BYTES;
  const unterminated = Buffer.concat([frame.subarray(0, afterLength), UNTERMINATED_VARINT]);
  expect(
    [frame.subarray(0, afterType), frame.subarray(0, afterLength), unterminated, SINGLE_BYTE_FRAME].map(awarenessEntryCountOf),
  ).toEqual([UNREADABLE_ENTRY_COUNT, UNREADABLE_ENTRY_COUNT, UNREADABLE_ENTRY_COUNT, null]);
});

const PADDED_ENTRY_COUNT = 100_000;
const PINNED_CLOCK = 2 ** 53;
const TRUNCATED_STATE_BYTES = 3;

test('the entries of an awareness frame are the client ids and clocks it declares', () => {
  const frame = awarenessFrameClaiming({ roomName: ROOM_NAME, clientIds: [7, 8, 9], clock: 5 });
  expect(awarenessEntriesOf(frame)).toEqual([
    { clientId: 7, clock: 5 },
    { clientId: 8, clock: 5 },
    { clientId: 9, clock: 5 },
  ]);
});

test('a well-formed clock of 2 to the 53 is read as it is', () => {
  const frame = awarenessFrameClaiming({ roomName: ROOM_NAME, clientIds: [FIRST_CLAIMED_ID], clock: PINNED_CLOCK, state: null });
  expect(awarenessEntriesOf(frame)).toEqual([{ clientId: FIRST_CLAIMED_ID, clock: PINNED_CLOCK }]);
  expect(awarenessEntryCountOf(frame)).toBe(1);
});

test('a clock varint that never ends within eight bytes makes the entry count unreadable', () => {
  const frame = awarenessFrameClaiming({ roomName: ROOM_NAME, clientIds: [FIRST_CLAIMED_ID], clock: 1 });
  const clockIndex = frame.indexOf(Buffer.from([FIRST_CLAIMED_ID, 1])) + 1;
  const overlong = Buffer.concat([frame.subarray(0, clockIndex), Buffer.alloc(9, 0x80), frame.subarray(clockIndex + 1)]);
  expect(awarenessEntryCountOf(overlong)).toBe(UNREADABLE_ENTRY_COUNT);
  expect(awarenessEntriesOf(overlong)).toEqual([]);
});

test('a frame that is not awareness has no entries', () => {
  expect(awarenessEntriesOf(syncStepOneFrame(ROOM_NAME))).toEqual([]);
});

test('an entry cut inside its state makes the entry count unreadable', () => {
  const frame = claimingFrame({ count: 2 });
  expect(awarenessEntryCountOf(frame.subarray(0, frame.length - TRUNCATED_STATE_BYTES))).toBe(UNREADABLE_ENTRY_COUNT);
  expect(awarenessEntriesOf(frame.subarray(0, frame.length - TRUNCATED_STATE_BYTES))).toEqual([]);
});

test('canonical entries with a null state at a small clock keep their declared count', () => {
  const frame = awarenessFrameClaiming({ roomName: ROOM_NAME, clientIds: [FIRST_CLAIMED_ID], clock: 1, state: null });
  expect(awarenessEntryCountOf(frame)).toBe(1);
});
const MAX_VARINT_BYTES_READ = 6;
const OVERLONG_FRAME_BYTES = 80 * 1024 * 1024;
const CONTINUING_BYTE = 0x80;

test('an 80 MiB frame of continuing bytes is read at most six bytes deep per varint and claims an unbounded entry count', () => {
  const frame = Buffer.alloc(OVERLONG_FRAME_BYTES, CONTINUING_BYTE);
  const subarray = vi.spyOn(frame, 'subarray');
  expect(awarenessEntryCountOf(frame)).toBe(UNREADABLE_ENTRY_COUNT);
  expect(frameBucketOf(frame)).toBe(FrameBucket.Updates);
  expect(subarray.mock.results.every(({ value }) => value.length <= MAX_VARINT_BYTES_READ)).toBe(true);
});

Object.values(PaddedVarintField).forEach((paddedField) =>
  test(`an awareness frame with a padded ${paddedField} claims an unbounded entry count`, () => {
    const frame = paddedAwarenessFrame({ roomName: ROOM_NAME, paddedField, claimedEntryCount: PADDED_ENTRY_COUNT });
    expect(awarenessEntryCountOf(frame)).toBe(UNREADABLE_ENTRY_COUNT);
  }),
);
