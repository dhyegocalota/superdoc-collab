import { expect, test } from 'vitest';
import { authFrame, awarenessFrame, awarenessFrameClaiming, syncStepOneFrame } from '../testing/socket-frames';
import { awarenessEntryCountOf, FrameBucket, frameBucketOf } from './frame-bucket';

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
  ).toEqual([null, null, null, null]);
});
