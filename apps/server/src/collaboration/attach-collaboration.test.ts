import {
  ApiPath,
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION,
  MAX_AWARENESS_ENTRIES_PER_FRAME,
  MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
  MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  POLICY_VIOLATION_CLOSE_CODE,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SOCKET_AWARENESS_ENTRIES_REASON,
  SOCKET_AWARENESS_IDS_REASON,
  SOCKET_AWARENESS_ORIGIN_REASON,
  SOCKET_CLOSE_GRACE_MS,
  SOCKET_RATE_LIMIT_REASON,
  UNAUTHORIZED_CLOSE_CODE,
  SOCKET_SINGLE_DOCUMENT_REASON,
  VERSION_FAILURE_TTL_MS,
  versionCollaborationPath,
} from '@superdoc-collab/types';
import { OutgoingMessage, type Hocuspocus } from '@hocuspocus/server';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import { Duplex } from 'node:stream';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { CollaborationRefusedError, connectAgentToDocument, connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { awarenessFrame, awarenessFrameClaiming, PaddedVarintField, paddedAwarenessFrame } from '../testing/socket-frames';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';
import { editedAfterBootstrap } from '../testing/timeline-client';
import { SUPERDOC_ROOM_PREFIX } from './room-name';
import type { Auth } from '../auth/auth';
import { attachCollaboration } from './attach-collaboration';
import { VersionAdmission, type VersionRooms } from './version-rooms';

const LOOPBACK_HOST = '127.0.0.1';
const TYPING_BURST_FRAMES = 600;
const AWARENESS_BURST_FRAMES = 3000;
const AWARENESS_ROOM_NAME = 'superdoc-room-1';
const CLAIMED_ID_BASE = 1_000_000;
const SECOND_CLAIMED_ID_BASE = 2_000_000;
const SPLIT_CLAIM_IDS_PER_FRAME = 5;
const PADDED_ENTRY_COUNT = 100_000;
const REPLAY_CLOCK = 2;
const REPLAYED_ID_COUNT = 5;
const OWN_UPDATES = 5;
const RECONNECTED_CURSOR = 99;
const UNMASKED_BINARY_FRAME = Buffer.from([0x82, 0x01, 0x00]);
const FOREIGN_ORIGIN = 'https://evil.example';
const HEALTH_OK_STATUS = 200;
const SHORT_SOCKET_TIMEOUT_MS = 300;
const UNAUTHENTICATED_CLOSE_DEADLINE_MS = 8_000;
const SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS = 15_000;
const DECODE_FAILURE = 'decode failed';
const RESET_FAILURE = 'ECONNRESET';
const ORIGIN = 'http://app.test';
const FOREIGN_ADDRESS = '203.0.113.9';
const ABNORMAL_CLOSE_CODE = 1006;
const SESSION_EXPIRED_REASON = 'Session expired';
const PAYLOAD_TOO_BIG_CLOSE_CODE = 1009;
const FRAME_OVERHEAD_BYTES = 1024;
const PADDED_UPDATE_TEST_TIMEOUT_MS = 60_000;
const FINAL_BINARY_FRAME_BYTE = 0x82;
const MASKED_FLAG = 0x80;
const EXTENDED_LENGTH_MARKER = 126;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const ZERO_MASK_KEY = Buffer.alloc(4);
const SECRET_PAYLOAD_TEXT = 'secret-payload-text';
const FLOOD_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_FLOOD_DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';
const FLOOD_ROOM_NAME = `${SUPERDOC_ROOM_PREFIX}${FLOOD_DOCUMENT_ID}`;

function maskedBinaryFrame(payload: Buffer): Buffer {
  const header = Buffer.from([
    FINAL_BINARY_FRAME_BYTE,
    EXTENDED_LENGTH_MARKER | MASKED_FLAG,
    payload.length >> BYTE_BITS,
    payload.length & BYTE_MASK,
  ]);
  return Buffer.concat([header, ZERO_MASK_KEY, payload]);
}

function validUpdateFrame(roomName: string = FLOOD_ROOM_NAME): Buffer {
  const document = new Y.Doc();
  document.getText('t').insert(0, SECRET_PAYLOAD_TEXT);
  const message = new OutgoingMessage(roomName).createSyncMessage().writeUpdate(Y.encodeStateAsUpdate(document));
  return Buffer.from(message.toUint8Array());
}

function openFloodSocket({ server, cookie }: { server: TestServer; cookie: string }): {
  socket: WebSocket;
  closed: Promise<{ code: number; reason: string }>;
} {
  const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, {
    origin: server.baseUrl,
    headers: { cookie },
  });
  socket.on('error', () => undefined);
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  return { socket, closed };
}

function closeCodeAfterSending({ server, cookie, frame }: { server: TestServer; cookie: string; frame: Buffer }): Promise<number> {
  const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, {
    origin: server.baseUrl,
    headers: { cookie },
    maxPayload: 2 * MAX_SOCKET_MESSAGE_BYTES,
  });
  socket.on('error', () => undefined);
  socket.on('open', () => socket.send(frame));
  return new Promise((resolve) => socket.on('close', (code) => resolve(code)));
}

function upgradeRequest({ path, origin, cookie }: { path: string; origin: string; cookie: string }): string {
  return [
    `GET ${path} HTTP/1.1`,
    `Host: ${LOOPBACK_HOST}`,
    `Origin: ${origin}`,
    `Cookie: ${cookie}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');
}

function exchange({
  server,
  path,
  origin = server.baseUrl,
  cookie = '',
  followUp = null,
}: {
  server: TestServer;
  path: string;
  origin?: string;
  cookie?: string;
  followUp?: Buffer | null;
}): Promise<string> {
  const { port } = new URL(server.baseUrl);
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
    const received: Buffer[] = [];
    socket.on('connect', () => socket.write(upgradeRequest({ path, origin, cookie })));
    socket.on('data', (chunk) => {
      received.push(chunk);
      if (followUp) socket.write(followUp);
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(Buffer.concat(received).toString()));
  });
}

function firstChunk({
  server,
  path,
  cookie,
  origin = server.baseUrl,
}: {
  server: TestServer;
  path: string;
  cookie: string;
  origin?: string;
}): Promise<string> {
  const { port } = new URL(server.baseUrl);
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
    socket.on('connect', () => socket.write(upgradeRequest({ path, origin, cookie })));
    socket.once('data', (chunk) => {
      resolve(chunk.toString());
      socket.destroy();
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(''));
  });
}

async function healthStatus(server: TestServer): Promise<number> {
  return (await fetch(`${server.baseUrl}${ApiPath.Health}`)).status;
}

describe('attachCollaboration', () => {
  test('a frame over the payload cap closes with 1009 that the client receives', { timeout: PADDED_UPDATE_TEST_TIMEOUT_MS }, async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const closeCode = await closeCodeAfterSending({ server, cookie, frame: Buffer.alloc(MAX_SOCKET_MESSAGE_BYTES + 1) });
    expect(closeCode).toBe(PAYLOAD_TOO_BIG_CLOSE_CODE);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    await server.stop();
  });
  test('a valid update padded to the cap is accepted', { timeout: PADDED_UPDATE_TEST_TIMEOUT_MS }, async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
    client.document.getText('t').insert(0, 'x'.repeat(MAX_SOCKET_MESSAGE_BYTES - FRAME_OVERHEAD_BYTES));
    await expect.poll(() => server.services.updateLog.hasUpdates(documentId), { timeout: PADDED_UPDATE_TEST_TIMEOUT_MS }).toBe(true);
    client.close();
    await server.stop();
  });
  test('more frames than the cap before authentication close the socket with 1008, are not applied and are logged without the payload', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { socket, closed } = openFloodSocket({ server, cookie });
    await new Promise((resolve) => socket.on('open', resolve));
    const frame = validUpdateFrame();
    Array.from({ length: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND + 1 }).forEach(() => socket.send(frame));
    expect(await closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_RATE_LIMIT_REASON });
    expect(server.services.updateLog.hasUpdates(FLOOD_DOCUMENT_ID)).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET_PAYLOAD_TEXT);
    warn.mockRestore();
    await server.stop();
  });
  test('a frame for a second document on one socket closes it with 1008', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    const { socket, closed } = openFloodSocket({ server, cookie });
    await new Promise((resolve) => socket.on('open', resolve));
    socket.send(validUpdateFrame());
    socket.send(validUpdateFrame(`${SUPERDOC_ROOM_PREFIX}${OTHER_FLOOD_DOCUMENT_ID}`));
    expect(await closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_SINGLE_DOCUMENT_REASON });
    await server.stop();
  });
  test('a server close that the peer ignores destroys the socket within the grace period', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    const { port } = new URL(server.baseUrl);
    const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
    socket.on('error', () => undefined);
    socket.on('connect', () => socket.write(upgradeRequest({ path: ApiPath.Collaboration, origin: server.baseUrl, cookie })));
    socket.once('data', () => {
      const frames = [validUpdateFrame(), validUpdateFrame(`${SUPERDOC_ROOM_PREFIX}${OTHER_FLOOD_DOCUMENT_ID}`)];
      frames.forEach((frame) => socket.write(maskedBinaryFrame(frame)));
    });
    const outcome = await Promise.race([
      new Promise<string>((resolve) => socket.on('close', () => resolve('destroyed'))),
      new Promise<string>((resolve) => setTimeout(() => resolve('open'), SOCKET_CLOSE_GRACE_MS * 5)),
    ]);
    socket.destroy();
    await server.stop();
    expect(outcome).toBe('destroyed');
  });
  test('more awareness frames than the cap close the socket with 1008 and the reason', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
    Array.from({ length: MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND + 1 }).forEach((_, index) =>
      client.provider.setAwarenessField('cursor', index),
    );
    expect(await client.closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_RATE_LIMIT_REASON });
    warn.mockRestore();
    client.close();
    await server.stop();
  });
  test('a malformed frame after the upgrade does not crash the server', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    const response = await exchange({ server, path: ApiPath.Collaboration, cookie, followUp: UNMASKED_BINARY_FRAME });
    expect(response).toContain('101');
    expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
    await server.stop();
  });
  test('a browser upgrade without a session cookie is destroyed before it reaches Hocuspocus', async () => {
    const server = await startTestServer();
    const handleConnection = vi.spyOn(server.services.hocuspocus, 'handleConnection');
    const response = await exchange({ server, path: ApiPath.Collaboration });
    expect(response).toBe('');
    expect(handleConnection).not.toHaveBeenCalled();
    await server.stop();
  });
  test('a browser whose session expired is closed with 4401 and never reaches Hocuspocus', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    server.database.sqlite.prepare('DELETE FROM session').run();
    const handleConnection = vi.spyOn(server.services.hocuspocus, 'handleConnection');
    const { socket, closed } = openFloodSocket({ server, cookie });
    expect(await closed).toEqual({ code: UNAUTHORIZED_CLOSE_CODE, reason: SESSION_EXPIRED_REASON });
    expect(handleConnection).not.toHaveBeenCalled();
    socket.terminate();
    await server.stop();
  });
  test('a session lookup that throws destroys the connection instead of closing with 4401', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    const getSession = vi.spyOn(server.auth.api, 'getSession').mockRejectedValue(new Error(RESET_FAILURE));
    const handleConnection = vi.spyOn(server.services.hocuspocus, 'handleConnection');
    const { closed } = openFloodSocket({ server, cookie });
    expect((await closed).code).toBe(ABNORMAL_CLOSE_CODE);
    expect(handleConnection).not.toHaveBeenCalled();
    getSession.mockRestore();
    await server.stop();
  });
  test('an upgrade on another path is destroyed and the server keeps answering', async () => {
    const server = await startTestServer();
    const response = await exchange({ server, path: '/other' });
    expect(response).toBe('');
    expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
    await server.stop();
  });
  test(
    'an upgrade from a foreign origin with a valid session cookie is destroyed',
    { timeout: SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS },
    async () => {
      const server = await startTestServer();
      const { cookie } = await signedInUser({ server, name: 'Carla' });
      const response = await exchange({ server, path: ApiPath.Collaboration, origin: FOREIGN_ORIGIN, cookie });
      expect(response).toBe('');
      await server.stop();
    },
  );
  test('the browser path still refuses a missing origin', async () => {
    const server = await startTestServer();
    const response = await exchange({ server, path: ApiPath.Collaboration, origin: '' });
    expect(response).toBe('');
    await server.stop();
  });
  test('an agent path upgrade without an origin reaches authentication', async () => {
    const server = await startTestServer();
    const response = await firstChunk({ server, path: ApiPath.AgentCollaboration, cookie: '', origin: '' });
    expect(response.startsWith('HTTP/1.1 101')).toBe(true);
    expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
    await server.stop();
  });
  test('an agent path connection with an empty token is refused by authentication', async () => {
    const { server, documentId } = await documentWithOwner();
    await expect(connectAgentToDocument({ server, token: '', documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('an upgrade on a path that only extends the agent path is destroyed', async () => {
    const server = await startTestServer();
    const response = await exchange({ server, path: `${ApiPath.AgentCollaboration}/other`, origin: '' });
    expect(response).toBe('');
    await server.stop();
  });
  test('a socket that never authenticates is closed by the server as unauthorized', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Eva' });
    server.services.hocuspocus.configuration.timeout = SHORT_SOCKET_TIMEOUT_MS;
    const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, {
      origin: server.baseUrl,
      headers: { cookie },
    });
    const openedAt = new Promise<number>((resolve) => socket.on('open', () => resolve(Date.now())));
    const closeCode = await new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
    const closedAt = Date.now();
    await server.stop();
    expect(closeCode).toBe(UNAUTHORIZED_CLOSE_CODE);
    expect(closedAt - (await openedAt)).toBeLessThan(UNAUTHENTICATED_CLOSE_DEADLINE_MS);
  });
  test('a client that resets the socket while the version upgrade is authorized does not crash the server', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Dora' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const authorize = vi
      .spyOn(server.services.versionRooms, 'authorize')
      .mockImplementation(() => gate.then(() => VersionAdmission.Refused));
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);
    try {
      const { port } = new URL(server.baseUrl);
      const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
      socket.on('error', () => undefined);
      socket.on('connect', () =>
        socket.write(
          upgradeRequest({ path: versionCollaborationPath({ documentId: randomUUID(), sequence: 1 }), origin: server.baseUrl, cookie }),
        ),
      );
      await expect.poll(() => authorize.mock.calls.length).toBe(1);
      socket.resetAndDestroy();
      expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
      release();
      expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
    } finally {
      process.off('uncaughtException', uncaught);
    }
    expect(uncaught).not.toHaveBeenCalled();
    await server.stop();
  });
  test(
    'a version that failed to load recently is refused with 503 before the upgrade',
    { timeout: SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS },
    async () => {
      const { server, documentId, owner, client } = await editedAfterBootstrap();
      const [mark] = server.services.readModel.marks(documentId);
      const endpoint = { documentId, sequence: mark!.sequence };
      const version = vi.spyOn(server.services.scheduler, 'version').mockRejectedValue(new Error(DECODE_FAILURE));
      await expect(server.services.versions.load(endpoint)).rejects.toThrow(DECODE_FAILURE);
      const response = await firstChunk({ server, path: versionCollaborationPath(endpoint), cookie: owner.cookie });
      expect(response.startsWith(`HTTP/1.1 ${HttpStatus.ServiceUnavailable}`)).toBe(true);
      expect(response).toContain(`${RETRY_AFTER_HEADER}: ${VERSION_FAILURE_TTL_MS / SECOND_MS}`);
      expect(server.services.versionRooms.size()).toBe(0);
      version.mockRestore();
      client.close();
      await server.stop();
    },
  );
  test('a socket that resets while the 503 is still being flushed does not throw', async () => {
    const authorize = vi.fn().mockResolvedValue(VersionAdmission.Unavailable);
    const httpServer = new EventEmitter();
    attachCollaboration({
      httpServer: httpServer as unknown as Server,
      auth: {} as Auth,
      hocuspocus: {} as Hocuspocus,
      versionRooms: { authorize } as unknown as VersionRooms,
      path: ApiPath.Collaboration,
      allowedOrigin: ORIGIN,
    });
    const socket = new Duplex({
      read: () => undefined,
      write: () => undefined,
    });
    const end = vi.spyOn(socket, 'end');
    httpServer.emit(
      'upgrade',
      { url: versionCollaborationPath({ documentId: randomUUID(), sequence: 1 }), headers: { origin: ORIGIN } },
      socket,
      Buffer.alloc(0),
    );
    await vi.waitFor(() => expect(end).toHaveBeenCalledOnce());
    expect(() => socket.emit('error', new Error(RESET_FAILURE))).not.toThrow();
    expect(socket.destroyed).toBe(true);
  });

  test('an agent upgrade from a non-loopback address is refused', () => {
    const httpServer = new EventEmitter();
    attachCollaboration({
      httpServer: httpServer as unknown as Server,
      auth: {} as Auth,
      hocuspocus: {} as Hocuspocus,
      versionRooms: {} as unknown as VersionRooms,
      path: ApiPath.Collaboration,
      allowedOrigin: ORIGIN,
    });
    const socket = new Duplex({ read: () => undefined, write: () => undefined });
    const destroy = vi.spyOn(socket, 'destroy');
    httpServer.emit(
      'upgrade',
      { url: ApiPath.AgentCollaboration, headers: {}, socket: { remoteAddress: FOREIGN_ADDRESS } },
      socket,
      Buffer.alloc(0),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});

async function openCountedSocket() {
  const received = vi.fn();
  const hocuspocus = {
    handleConnection: (webSocket: WebSocket) => webSocket.on('message', received),
  } as unknown as Hocuspocus;
  const auth = {
    api: { getSession: async () => ({ user: { id: 'user-1', name: 'Eva', email: 'eva@example.test', role: 'user', timeZone: null } }) },
  } as unknown as Auth;
  const httpServer = createServer();
  attachCollaboration({
    httpServer,
    auth,
    hocuspocus,
    versionRooms: {} as VersionRooms,
    path: ApiPath.Collaboration,
    allowedOrigin: ORIGIN,
  });
  await new Promise<void>((resolve) => httpServer.listen(0, LOOPBACK_HOST, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${port}${ApiPath.Collaboration}`, {
    origin: ORIGIN,
    headers: { cookie: 'session=1' },
  });
  socket.on('error', () => undefined);
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  await new Promise((resolve) => socket.on('open', resolve));
  return { socket, closed, received, httpServer };
}

test('a typing burst of 600 frames in one second is accepted and the socket stays open', async () => {
  const { socket, received, httpServer } = await openCountedSocket();
  Array.from({ length: TYPING_BURST_FRAMES }).forEach(() => socket.send(Buffer.from([0])));
  await expect.poll(() => received.mock.calls.length).toBe(TYPING_BURST_FRAMES);
  expect(socket.readyState).toBe(WebSocket.OPEN);
  socket.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('the frame that breaches the limit reaches the room handler and nothing after it does', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket();
  Array.from({ length: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND + 10 }).forEach(() => socket.send(Buffer.from([0])));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).toHaveBeenCalledTimes(MAX_SOCKET_UPDATE_FRAMES_PER_SECOND + 1);
  await new Promise((resolve) => httpServer.close(resolve));
});

test('an awareness burst of 3000 frames in one second is accepted and the socket stays open', async () => {
  const { socket, received, httpServer } = await openCountedSocket();
  Array.from({ length: AWARENESS_BURST_FRAMES }).forEach(() => socket.send(awarenessFrame(AWARENESS_ROOM_NAME)));
  await expect.poll(() => received.mock.calls.length).toBe(AWARENESS_BURST_FRAMES);
  expect(socket.readyState).toBe(WebSocket.OPEN);
  socket.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('the awareness frame past its own cap closes the socket with 1008 and nothing after it is read', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket();
  Array.from({ length: MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND + 10 }).forEach(() => socket.send(awarenessFrame(AWARENESS_ROOM_NAME)));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).toHaveBeenCalledTimes(MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND + 1);
  await new Promise((resolve) => httpServer.close(resolve));
});

async function connectWatched({ server, documentId, cookie }: { server: TestServer; documentId: string; cookie: string }) {
  const client = await connectToDocument({ server, cookie, documentId });
  let closedSocket: { code: number; reason: string } | null = null;
  void client.closed.then((event) => (closedSocket = event));
  const roomName = `${SUPERDOC_ROOM_PREFIX}${documentId}`;
  const webSocket = client.provider.configuration.websocketProvider.webSocket!;
  return { client, closedSocket: () => closedSocket, webSocket, roomName };
}

async function sendClaimingFrame({ clientIds }: { clientIds: number[] }) {
  const { server, documentId, owner } = await documentWithOwner();
  const connection = await connectWatched({ server, documentId, cookie: owner.cookie });
  connection.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: connection.roomName, clientIds })));
  return { server, ...connection };
}

function claimedIds({ base, count }: { base: number; count: number }): number[] {
  return Array.from({ length: count }, (_, index) => base + index);
}

function isKnownToAwareness({
  server,
  clientId,
}: {
  server: Awaited<ReturnType<typeof sendClaimingFrame>>['server'];
  clientId: number;
}): boolean {
  return [...server.services.hocuspocus.documents.values()].some((document) => document.awareness.meta.has(clientId));
}

test('an awareness frame claiming one entry more than the frame cap closes the socket with 1008 before the room decodes it', async () => {
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_ENTRIES_PER_FRAME + 1 });
  const { server, client, closedSocket } = await sendClaimingFrame({ clientIds });
  await expect.poll(closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ENTRIES_REASON });
  expect(clientIds.some((clientId) => isKnownToAwareness({ server, clientId }))).toBe(false);
  client.close();
  await server.stop();
});

test('one frame claiming one client id more than the connection cap closes the socket with the client ids reason', async () => {
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION + 1 });
  const { server, client, closedSocket } = await sendClaimingFrame({ clientIds });
  await expect.poll(closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_IDS_REASON });
  client.close();
  await server.stop();
});

test('claims split over frames that together pass the connection cap close the socket with the client ids reason', async () => {
  const firstIds = claimedIds({ base: CLAIMED_ID_BASE, count: SPLIT_CLAIM_IDS_PER_FRAME });
  const secondIds = claimedIds({ base: SECOND_CLAIMED_ID_BASE, count: SPLIT_CLAIM_IDS_PER_FRAME });
  const { server, client, closedSocket, webSocket, roomName } = await sendClaimingFrame({ clientIds: firstIds });
  webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName, clientIds: secondIds })));
  await expect.poll(closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_IDS_REASON });
  client.close();
  await server.stop();
});

Object.values(PaddedVarintField).forEach((paddedField) =>
  test(`an awareness frame with a padded ${paddedField} never reaches the room handler and closes the socket with 1008`, async () => {
    const { socket, closed, received, httpServer } = await openCountedSocket();
    socket.send(paddedAwarenessFrame({ roomName: AWARENESS_ROOM_NAME, paddedField, claimedEntryCount: PADDED_ENTRY_COUNT }));
    expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
    expect(received).not.toHaveBeenCalled();
    await new Promise((resolve) => httpServer.close(resolve));
  }),
);

test('a frame claiming exactly the frame cap of entries reaches the room handler and keeps the socket open', async () => {
  const { socket, received, httpServer } = await openCountedSocket();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_ENTRIES_PER_FRAME });
  socket.send(awarenessFrameClaiming({ roomName: AWARENESS_ROOM_NAME, clientIds }));
  await expect.poll(() => received.mock.calls.length).toBe(1);
  expect(socket.readyState).toBe(WebSocket.OPEN);
  socket.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('the frame claiming too many entries never reaches the room handler and nothing after it does', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_ENTRIES_PER_FRAME + 1 });
  socket.send(awarenessFrameClaiming({ roomName: AWARENESS_ROOM_NAME, clientIds }));
  socket.send(awarenessFrame(AWARENESS_ROOM_NAME));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).not.toHaveBeenCalled();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('an awareness frame claiming exactly the connection cap of client ids keeps the socket open', async () => {
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION });
  const { server, client, closedSocket, webSocket } = await sendClaimingFrame({ clientIds });
  await expect
    .poll(() =>
      [...server.services.hocuspocus.documents.values()].some((document) => document.awareness.getStates().size >= clientIds.length),
    )
    .toBe(true);
  expect(closedSocket()).toBeNull();
  expect(webSocket.readyState).toBe(WebSocket.OPEN);
  client.close();
  await server.stop();
});

function awarenessStateCount({ server, clientIds }: { server: TestServer; clientIds: number[] }): number {
  return [...server.services.hocuspocus.documents.values()].reduce(
    (count, document) => count + clientIds.filter((clientId) => document.awareness.getStates().has(clientId)).length,
    0,
  );
}

test('ids a closed connection left behind and a second connection replays leave with that second connection', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  const anchor = await connectWatched({ server, documentId, cookie: owner.cookie });
  const first = await connectWatched({ server, documentId, cookie: owner.cookie });
  first.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: first.roomName, clientIds })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  first.client.close();
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(0);
  const replayer = await connectWatched({ server, documentId, cookie: owner.cookie });
  replayer.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: replayer.roomName, clientIds, clock: REPLAY_CLOCK })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  replayer.client.close();
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(0);
  expect(anchor.closedSocket()).toBeNull();
  anchor.client.close();
  await server.stop();
});

function serverCursorOf({ server, clientId }: { server: TestServer; clientId: number }): unknown {
  return [...server.services.hocuspocus.documents.values()]
    .map((document) => (document.awareness.getStates().get(clientId) as { cursor?: unknown } | undefined)?.cursor)
    .find((cursor) => cursor !== undefined);
}

async function holderOfClaimedIds() {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  const holder = await connectWatched({ server, documentId, cookie: owner.cookie });
  holder.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: holder.roomName, clientIds })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  const intruder = await connectWatched({ server, documentId, cookie: owner.cookie });
  return { server, clientIds, holder, intruder };
}

test('a connection updating an awareness id that another live connection holds is closed with the origin reason', async () => {
  const { server, clientIds, holder, intruder } = await holderOfClaimedIds();
  intruder.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: REPLAY_CLOCK })));
  await expect.poll(intruder.closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ORIGIN_REASON });
  expect(holder.closedSocket()).toBeNull();
  holder.client.close();
  await server.stop();
});

test('a connection relaying an awareness state at the clock the room already holds keeps the socket open', async () => {
  const { server, clientIds, holder, intruder } = await holderOfClaimedIds();
  intruder.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: intruder.roomName, clientIds })));
  const { provider, document } = intruder.client;
  provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: document.clientID })).toBe(0);
  expect(intruder.closedSocket()).toBeNull();
  expect(holder.closedSocket()).toBeNull();
  expect(intruder.webSocket.readyState).toBe(WebSocket.OPEN);
  holder.client.close();
  intruder.client.close();
  await server.stop();
});

test('a connection removing an awareness id that another live connection holds is closed with the origin reason', async () => {
  const { server, clientIds, holder, intruder } = await holderOfClaimedIds();
  const removal = awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: REPLAY_CLOCK, state: null });
  intruder.webSocket.send(new Uint8Array(removal));
  await expect.poll(intruder.closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ORIGIN_REASON });
  expect(holder.closedSocket()).toBeNull();
  holder.client.close();
  await server.stop();
});

test('a connection updating its own awareness id keeps the socket open', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const connection = await connectWatched({ server, documentId, cookie: owner.cookie });
  Array.from({ length: OWN_UPDATES }).forEach((_, index) => connection.client.provider.setAwarenessField('cursor', index));
  await expect.poll(() => awarenessStateCount({ server, clientIds: [connection.client.document.clientID] })).toBe(1);
  expect(connection.closedSocket()).toBeNull();
  expect(connection.webSocket.readyState).toBe(WebSocket.OPEN);
  connection.client.close();
  await server.stop();
});

test('a connection removing its own awareness id on leave keeps the socket open', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const connection = await connectWatched({ server, documentId, cookie: owner.cookie });
  const { clientID } = connection.client.document;
  connection.client.provider.setAwarenessField('cursor', 0);
  await expect.poll(() => awarenessStateCount({ server, clientIds: [clientID] })).toBe(1);
  connection.client.provider.awareness!.setLocalState(null);
  await expect.poll(() => awarenessStateCount({ server, clientIds: [clientID] })).toBe(0);
  expect(connection.closedSocket()).toBeNull();
  expect(connection.webSocket.readyState).toBe(WebSocket.OPEN);
  connection.client.close();
  await server.stop();
});

test('a provider that reconnects and resends its own awareness id keeps its new socket open', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const anchor = await connectWatched({ server, documentId, cookie: owner.cookie });
  const connection = await connectWatched({ server, documentId, cookie: owner.cookie });
  const { provider, document } = connection.client;
  provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: document.clientID })).toBe(0);
  connection.webSocket.close();
  await expect
    .poll(() => {
      const { webSocket } = provider.configuration.websocketProvider;
      return webSocket !== connection.webSocket && webSocket?.readyState === WebSocket.OPEN;
    })
    .toBe(true);
  provider.setAwarenessField('cursor', RECONNECTED_CURSOR);
  await expect.poll(() => serverCursorOf({ server, clientId: document.clientID })).toBe(RECONNECTED_CURSOR);
  expect(provider.configuration.websocketProvider.webSocket?.readyState).toBe(WebSocket.OPEN);
  connection.client.close();
  anchor.client.close();
  await server.stop();
});
