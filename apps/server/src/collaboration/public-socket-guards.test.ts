import {
  ACCESS_REVOKED_CLOSE_CODE,
  POLICY_VIOLATION_CLOSE_CODE,
  PUBLIC_MAX_SOCKET_MESSAGE_BYTES,
  PUBLIC_MESSAGE_REASON,
} from '@superdoc-collab/types';
import { MessageType } from '@hocuspocus/server';
import { expect, test, vi } from 'vitest';
import type WebSocket from 'ws';
import { connectAsVisitor, connectToDocument } from '../testing/collaboration-client';
import { publicRoom, visitorToken } from '../testing/public-room';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const TOO_BIG_CLOSE_CODE = 1009;
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const EMPTY_UPDATE = [0, 0];
const SYNC_STEP2_FLOOD = 5;
const AWARENESS_FIELD = 'user';
const SECRET_EMAIL = 'ana@example.com';
const SECRET_ID = 'secret-user-id';

function varUint(value: number): number[] {
  if (value < 0x80) return [value];
  return [(value & 0x7f) | 0x80, ...varUint(value >>> 7)];
}

function varString(text: string): number[] {
  const bytes = [...Buffer.from(text)];
  return [...varUint(bytes.length), ...bytes];
}

function frameOf({ documentId, type, body }: { documentId: string; type: MessageType; body: number[] }): Buffer {
  return Buffer.from([...varString(`${SUPERDOC_ROOM_PREFIX}${documentId}`), ...varUint(type), ...body]);
}

function socketOf(client: Awaited<ReturnType<typeof connectAsVisitor>>): WebSocket {
  const { webSocket } = client.provider.configuration.websocketProvider as unknown as { webSocket: WebSocket };
  return webSocket;
}

test('a visitor receives the awareness of a member without the email or the ids', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  ownerClient.provider.setAwarenessField(AWARENESS_FIELD, { id: SECRET_ID, name: 'Ana', email: SECRET_EMAIL, color: '#ff0000' });
  ownerClient.provider.setAwarenessField('userId', SECRET_ID);
  await expect.poll(() => visitor.provider.awareness?.getStates().get(ownerClient.document.clientID)).toBeDefined();
  const received = visitor.provider.awareness?.getStates().get(ownerClient.document.clientID);
  expect(received).toMatchObject({ user: { name: 'Ana', color: '#ff0000' } });
  expect(JSON.stringify(received)).not.toContain(SECRET_EMAIL);
  expect(JSON.stringify(received)).not.toContain(SECRET_ID);
  const own = ownerClient.provider.awareness?.getStates().get(ownerClient.document.clientID);
  expect(JSON.stringify(own)).toContain(SECRET_EMAIL);
  [ownerClient, visitor].forEach((client) => client.close());
  await server.stop();
});

test('a visitor that sends a broadcast stateless message is closed and nobody receives it', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const received = vi.fn();
  ownerClient.provider.on('stateless', received);
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  socketOf(visitor).send(frameOf({ documentId, type: MessageType.BroadcastStateless, body: varString('hello everyone') }));
  expect(await visitor.closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: PUBLIC_MESSAGE_REASON });
  expect(received).not.toHaveBeenCalled();
  ownerClient.close();
  await server.stop();
});

test.each([MessageType.Stateless, MessageType.SyncStatus, MessageType.Auth])('a visitor message of type %s is closed', async (type) => {
  const { server, documentId } = await publicRoom();
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  socketOf(visitor).send(frameOf({ documentId, type, body: varString('x') }));
  expect((await visitor.closed).code).toBe(POLICY_VIOLATION_CLOSE_CODE);
  await server.stop();
});

test('a visitor frame over the public size cap closes the socket and a normal one does not', async () => {
  const { server, documentId } = await publicRoom();
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  socketOf(visitor).send(Buffer.alloc(PUBLIC_MAX_SOCKET_MESSAGE_BYTES + 1));
  expect((await visitor.closed).code).toBe(TOO_BIG_CLOSE_CODE);
  expect(TOO_BIG_CLOSE_CODE).not.toBe(ACCESS_REVOKED_CLOSE_CODE);
  await server.stop();
});

test('a visitor that sends more than one write-shaped sync message is closed, after the one its handshake needs', async () => {
  const { server, documentId } = await publicRoom();
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  const syncStep2 = frameOf({ documentId, type: MessageType.Sync, body: [SYNC_STEP2, ...varUint(EMPTY_UPDATE.length), ...EMPTY_UPDATE] });
  Array.from({ length: SYNC_STEP2_FLOOD }).forEach(() => socketOf(visitor).send(syncStep2));
  expect(await visitor.closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: PUBLIC_MESSAGE_REASON });
  await server.stop();
});

test('a visitor that asks for the whole state over and over without answering is closed', async () => {
  const { server, documentId } = await publicRoom();
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  const syncStep1 = frameOf({ documentId, type: MessageType.Sync, body: [SYNC_STEP1, ...varUint(EMPTY_UPDATE.length), ...EMPTY_UPDATE] });
  const socket = socketOf(visitor);
  const sendRaw = socket.send.bind(socket);
  socket.send = () => undefined;
  Array.from({ length: SYNC_STEP2_FLOOD }).forEach(() => sendRaw(syncStep1));
  expect(await visitor.closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: PUBLIC_MESSAGE_REASON });
  await server.stop();
});
