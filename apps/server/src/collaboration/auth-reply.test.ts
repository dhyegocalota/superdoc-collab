import { OutgoingMessage } from '@hocuspocus/server';
import { expect, test } from 'vitest';
import { awarenessFrame, syncStepOneFrame } from '../testing/socket-frames';
import { AuthReply, authReplyOf } from './auth-reply';

const ROOM_NAME = 'superdoc-room-1';
const DENIAL_REASON = 'permission-denied';

test('the reply that authenticates a connection reads as authenticated, for a writer and for a reader', () => {
  const frames = [false, true].map((isReadOnly) => new OutgoingMessage(ROOM_NAME).writeAuthenticated(isReadOnly).toUint8Array());
  expect(frames.map(authReplyOf)).toEqual([AuthReply.Authenticated, AuthReply.Authenticated]);
});

test('the reply that denies a connection reads as denied', () => {
  expect(authReplyOf(new OutgoingMessage(ROOM_NAME).writePermissionDenied(DENIAL_REASON).toUint8Array())).toBe(AuthReply.Denied);
});

test('sync, awareness and unreadable frames read as other', () => {
  const frames = [syncStepOneFrame(ROOM_NAME), awarenessFrame(ROOM_NAME), Buffer.from([0]), Buffer.alloc(0)];
  expect(frames.map(authReplyOf)).toEqual([AuthReply.Other, AuthReply.Other, AuthReply.Other, AuthReply.Other]);
});
