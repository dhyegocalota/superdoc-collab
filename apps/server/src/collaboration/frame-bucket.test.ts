import { expect, test } from 'vitest';
import { authFrame, awarenessFrame, syncStepOneFrame } from '../testing/socket-frames';
import { FrameBucket, frameBucketOf } from './frame-bucket';

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

test('a frame delivered as fragments or an array buffer is read the same way', () => {
  const frame = awarenessFrame(ROOM_NAME);
  const arrayBuffer = new ArrayBuffer(frame.length);
  new Uint8Array(arrayBuffer).set(frame);
  const fragments = [frame.subarray(0, 4), frame.subarray(4)];
  expect([frameBucketOf(fragments), frameBucketOf(arrayBuffer)]).toEqual([FrameBucket.Awareness, FrameBucket.Awareness]);
});
