import {
  ApiPath,
  ClientActor,
  DocumentRole,
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION,
  HEAVY_ROOMS_FULL_CLOSE_CODE,
  HEAVY_ROOMS_FULL_REASON,
  HEAVY_ROOMS_USER_CAP_CLOSE_CODE,
  HEAVY_ROOMS_USER_CAP_REASON,
  MAX_AWARENESS_ENTRIES_PER_FRAME,
  MINUTE_MS,
  PUBLIC_SOCKET_ADMISSIONS_PER_MINUTE,
  MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
  MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  POLICY_VIOLATION_CLOSE_CODE,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SOCKET_AWARENESS_ENTRIES_REASON,
  SOCKET_AWARENESS_IDS_REASON,
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
import {
  CollaborationRefusedError,
  connectAgentToDocument,
  connectToDocument,
  documentWithOwner,
  memberWithRole,
} from '../testing/collaboration-client';
import { commitBootstrap, waitForCommit } from '../testing/committed-room';
import { awarenessFrame, awarenessFrameClaiming, PaddedVarintField, paddedAwarenessFrame } from '../testing/socket-frames';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';
import { editedAfterBootstrap } from '../testing/timeline-client';
import { SUPERDOC_ROOM_PREFIX } from './room-name';
import type { Auth } from '../auth/auth';
import { KeyedSlidingWindow } from '../limits/keyed-sliding-window';
import { attachCollaboration, type PublicAdmission } from './attach-collaboration';
import { PRE_AUTHENTICATION_MAX_INFLATED_BYTES } from './socket-message-limit';
import { AWARENESS_DROP_LOG, AWARENESS_IDS_LOG } from './collaboration-server';
import { VersionAdmission, type VersionRooms } from './version-rooms';

const LOOPBACK_HOST = '127.0.0.1';
const TYPING_BURST_FRAMES = 600;
const DENIED_FOLLOW_UP_FRAMES = 20;
const DENIED_FOLLOW_UP_BYTES = 1024;
const COUNTED_ROOM_NAME = 'superdoc-room-1';
const AUTHENTICATED_ANSWER = new OutgoingMessage(COUNTED_ROOM_NAME).writeAuthenticated(false).toUint8Array();
const DENIED_ANSWER = new OutgoingMessage(COUNTED_ROOM_NAME).writePermissionDenied('permission-denied').toUint8Array();
const HEAVY_ROOMS_FULL_ANSWER = new OutgoingMessage(COUNTED_ROOM_NAME).writePermissionDenied(HEAVY_ROOMS_FULL_REASON).toUint8Array();
const USER_CAP_ANSWER = new OutgoingMessage(COUNTED_ROOM_NAME).writePermissionDenied(HEAVY_ROOMS_USER_CAP_REASON).toUint8Array();
const UNRELATED_ANSWER = Buffer.from([0]);
const AWARENESS_BURST_FRAMES = 3000;
const AWARENESS_ROOM_NAME = 'superdoc-room-1';
const CLAIMED_ID_BASE = 1_000_000;
const SECOND_CLAIMED_ID_BASE = 2_000_000;
const SPLIT_CLAIM_IDS_PER_FRAME = 5;
const PADDED_ENTRY_COUNT = 100_000;
const OVERCLAIMING_BURST_FRAMES = 10;
const PINNED_CLOCK = 2 ** 53;
const JUST_UNDER_CEILING_CLOCK = 2 ** 52 - 1;
const HELD_CLOCK = 1;
const REFUSED_BURST_FRAMES = 5;
const FORGED_STATE = { userId: 'forged' };
const TRUNCATED_STATE_BYTES = 3;
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
const PUBLIC_ADMISSION: PublicAdmission = {
  window: new KeyedSlidingWindow({ windowMs: MINUTE_MS, maxEvents: PUBLIC_SOCKET_ADMISSIONS_PER_MINUTE }),
  trustProxy: false,
  trustedProxyHops: 1,
};
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
  test('a bootstrap path upgrade without an origin reaches authentication', async () => {
    const server = await startTestServer();
    const response = await firstChunk({ server, path: ApiPath.BootstrapCollaboration, cookie: '', origin: '' });
    expect(response.startsWith('HTTP/1.1 101')).toBe(true);
    await server.stop();
  });
  test('an upgrade on a path that only extends the bootstrap path is destroyed', async () => {
    const server = await startTestServer();
    const response = await exchange({ server, path: `${ApiPath.BootstrapCollaboration}/other`, origin: '' });
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
      await expect(server.services.versions.load({ ...endpoint, userId: 'ana' })).rejects.toThrow(DECODE_FAILURE);
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
      publicAdmission: PUBLIC_ADMISSION,
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

  test.each([ApiPath.AgentCollaboration, ApiPath.BootstrapCollaboration])(
    'an upgrade on %s from a non-loopback address is refused',
    (path) => {
      const httpServer = new EventEmitter();
      attachCollaboration({
        httpServer: httpServer as unknown as Server,
        auth: {} as Auth,
        hocuspocus: {} as Hocuspocus,
        versionRooms: {} as unknown as VersionRooms,
        publicAdmission: PUBLIC_ADMISSION,
        path: ApiPath.Collaboration,
        allowedOrigin: ORIGIN,
      });
      const socket = new Duplex({ read: () => undefined, write: () => undefined });
      const destroy = vi.spyOn(socket, 'destroy');
      httpServer.emit('upgrade', { url: path, headers: {}, socket: { remoteAddress: FOREIGN_ADDRESS } }, socket, Buffer.alloc(0));
      expect(destroy).toHaveBeenCalledOnce();
    },
  );
});

async function openCountedSocket({
  answer = AUTHENTICATED_ANSWER,
  afterAnswer = () => undefined,
}: { answer?: Uint8Array | null; afterAnswer?: (webSocket: WebSocket) => void } = {}) {
  const received = vi.fn();
  const hocuspocus = {
    handleConnection: (webSocket: WebSocket) => {
      webSocket.on('message', received);
      if (answer !== null) webSocket.send(answer);
      afterAnswer(webSocket);
    },
  } as unknown as Hocuspocus;
  const auth = {
    api: {
      getSession: async () => ({
        session: { impersonatedBy: null },
        user: { id: 'user-1', name: 'Eva', email: 'eva@example.test', role: 'user', timeZone: null },
      }),
    },
  } as unknown as Auth;
  const httpServer = createServer();
  attachCollaboration({
    httpServer,
    auth,
    hocuspocus,
    versionRooms: {} as VersionRooms,
    publicAdmission: PUBLIC_ADMISSION,
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

test('the frame that breaches the pre-authentication total never reaches the room handler', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket({ answer: null });
  socket.send(Buffer.alloc(PRE_AUTHENTICATION_MAX_INFLATED_BYTES + 1));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).not.toHaveBeenCalled();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('a first reply that is not the authentication answer does not lift the pre-authentication total', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket({ answer: UNRELATED_ANSWER });
  socket.send(Buffer.alloc(PRE_AUTHENTICATION_MAX_INFLATED_BYTES + 1));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).not.toHaveBeenCalled();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('a socket the server denied is closed and the frames it keeps sending never reach the room handler', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket({ answer: DENIED_ANSWER });
  Array.from({ length: DENIED_FOLLOW_UP_FRAMES }).forEach(() => socket.send(Buffer.alloc(DENIED_FOLLOW_UP_BYTES)));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).not.toHaveBeenCalled();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('a socket denied because the heavy rooms are full closes with its own code and reason, not the policy violation one', async () => {
  const { socket, httpServer } = await openCountedSocket({ answer: HEAVY_ROOMS_FULL_ANSWER });
  const closed = await new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  expect(closed).toEqual({ code: HEAVY_ROOMS_FULL_CLOSE_CODE, reason: HEAVY_ROOMS_FULL_REASON });
  await new Promise((resolve) => httpServer.close(resolve));
});

test('a socket denied for the share of the user closes with the code and reason of that share', async () => {
  const { socket, httpServer } = await openCountedSocket({ answer: USER_CAP_ANSWER });
  const closed = await new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  expect(closed).toEqual({ code: HEAVY_ROOMS_USER_CAP_CLOSE_CODE, reason: HEAVY_ROOMS_USER_CAP_REASON });
  await new Promise((resolve) => httpServer.close(resolve));
});

test.each([
  ['authenticated', AUTHENTICATED_ANSWER, true],
  ['denied', DENIED_ANSWER, true],
  ['unrelated', UNRELATED_ANSWER, false],
])('the wrapped send stays on the socket only while no %s reply was sent', async (_, answer, isRestored) => {
  const sockets: WebSocket[] = [];
  const { socket, httpServer } = await openCountedSocket({ answer, afterAnswer: (webSocket) => sockets.push(webSocket) });
  await expect.poll(() => sockets.length).toBe(1);
  expect(Object.hasOwn(sockets[0]!, 'send')).toBe(!isRestored);
  socket.terminate();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('the frame that breaches the inflated budget never reaches the room handler', async () => {
  const { socket, closed, received, httpServer } = await openCountedSocket();
  socket.send(Buffer.alloc(MAX_SOCKET_MESSAGE_BYTES));
  socket.send(Buffer.alloc(MAX_SOCKET_MESSAGE_BYTES));
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(received).toHaveBeenCalledTimes(1);
  await new Promise((resolve) => httpServer.close(resolve));
});

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
  const closedSockets: { code: number; reason: string }[] = [];
  client.provider.on('close', ({ event }: { event: { code: number; reason: string } }) =>
    closedSockets.push({ code: event.code, reason: event.reason }),
  );
  const roomName = `${SUPERDOC_ROOM_PREFIX}${documentId}`;
  const webSocket = client.provider.configuration.websocketProvider.webSocket!;
  return { client, closedSocket: () => closedSocket, closedSockets: () => closedSockets, webSocket, roomName };
}

async function sendClaimingFrame({ clientIds, clock }: { clientIds: number[]; clock?: number }) {
  const { server, documentId, owner } = await documentWithOwner();
  const connection = await connectWatched({ server, documentId, cookie: owner.cookie });
  connection.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: connection.roomName, clientIds, clock })));
  return { server, ...connection };
}

function claimedIds({ base, count }: { base: number; count: number }): number[] {
  return Array.from({ length: count }, (_, index) => base + index);
}

function isKnownToAwareness({ server, clientId }: { server: TestServer; clientId: number }): boolean {
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

test('one frame claiming one client id more than the connection cap closes the socket with the client ids reason and a log line', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION + 1 });
  const { server, client, closedSocket } = await sendClaimingFrame({ clientIds });
  await expect.poll(closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_IDS_REASON });
  expect(warn).toHaveBeenCalledWith(AWARENESS_IDS_LOG);
  warn.mockRestore();
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

test('a burst of overclaiming frames logs one line and closes once', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { socket, closed, httpServer } = await openCountedSocket();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_ENTRIES_PER_FRAME + 1 });
  Array.from({ length: OVERCLAIMING_BURST_FRAMES }).forEach(() =>
    socket.send(awarenessFrameClaiming({ roomName: AWARENESS_ROOM_NAME, clientIds })),
  );
  expect(await closed).toBe(POLICY_VIOLATION_CLOSE_CODE);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
  await new Promise((resolve) => httpServer.close(resolve));
});

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

function highestAwarenessClock({ server, clientIds }: { server: TestServer; clientIds: number[] }): number {
  const clocks = [...server.services.hocuspocus.documents.values()].flatMap((document) =>
    clientIds.flatMap((clientId) => {
      const meta = document.awareness.meta.get(clientId);
      return meta === undefined ? [] : [meta.clock];
    }),
  );
  return Math.max(...clocks);
}

function stateUserIdOf({ server, clientId }: { server: TestServer; clientId: number }): unknown {
  return [...server.services.hocuspocus.documents.values()]
    .map((document) => (document.awareness.getStates().get(clientId) as { userId?: unknown } | undefined)?.userId)
    .find((userId) => userId !== undefined);
}

async function holderOfClaimedIds({ hasSameUser }: { hasSameUser: boolean }) {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  await waitForCommit({ services: server.services, documentId });
  const holder = await connectWatched({ server, documentId, cookie: owner.cookie });
  holder.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: holder.roomName, clientIds })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  const intruderCookie = hasSameUser ? owner.cookie : (await memberWithRole({ server, documentId, role: DocumentRole.Editor })).cookie;
  const intruder = await connectWatched({ server, documentId, cookie: intruderCookie });
  return { server, clientIds, holder, intruder };
}

async function expectDropped({ server, clientIds, holder, intruder }: Awaited<ReturnType<typeof holderOfClaimedIds>>): Promise<void> {
  const { provider, document } = intruder.client;
  provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: document.clientID })).toBe(0);
  expect(intruder.closedSocket()).toBeNull();
  expect(intruder.webSocket.readyState).toBe(WebSocket.OPEN);
  expect(holder.closedSocket()).toBeNull();
  expect(highestAwarenessClock({ server, clientIds })).toBeLessThan(REPLAY_CLOCK);
  expect(clientIds.map((clientId) => stateUserIdOf({ server, clientId }))).not.toContain(FORGED_STATE.userId);
}

test('a connection of another user updating an awareness id that a live connection holds is dropped, keeps its socket and logs a line', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const scenario = await holderOfClaimedIds({ hasSameUser: false });
  const { clientIds, intruder } = scenario;
  const forgery = awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: REPLAY_CLOCK, state: FORGED_STATE });
  intruder.webSocket.send(new Uint8Array(forgery));
  await expectDropped(scenario);
  expect(warn).toHaveBeenCalledWith(AWARENESS_DROP_LOG);
  warn.mockRestore();
  scenario.holder.client.close();
  intruder.client.close();
  await scenario.server.stop();
});

test('refused awareness frames from one socket log one line', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const scenario = await holderOfClaimedIds({ hasSameUser: false });
  const { clientIds, intruder } = scenario;
  const forgery = awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: REPLAY_CLOCK, state: FORGED_STATE });
  Array.from({ length: REFUSED_BURST_FRAMES }).forEach(() => intruder.webSocket.send(new Uint8Array(forgery)));
  await expectDropped(scenario);
  expect(warn.mock.calls.filter(([line]) => line === AWARENESS_DROP_LOG)).toHaveLength(1);
  warn.mockRestore();
  scenario.holder.client.close();
  intruder.client.close();
  await scenario.server.stop();
});

test('an id recorded for a user before the room loaded stays with its author: another user announcing it is dropped and the author passes', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  await waitForCommit({ services: server.services, documentId });
  clientIds.forEach((yjsClientId) =>
    server.services.updateLog.declareClientIdentity({ documentName: documentId, yjsClientId, userId: owner.id, actor: ClientActor.Human }),
  );
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const attacker = await connectWatched({ server, documentId, cookie: editor.cookie });
  attacker.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: attacker.roomName, clientIds })));
  attacker.client.provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: attacker.client.document.clientID })).toBe(0);
  expect(awarenessStateCount({ server, clientIds })).toBe(0);
  expect(attacker.closedSocket()).toBeNull();
  const victim = await connectWatched({ server, documentId, cookie: owner.cookie });
  victim.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: victim.roomName, clientIds })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  expect(victim.closedSocket()).toBeNull();
  attacker.client.close();
  victim.client.close();
  await server.stop();
});

test('an id observed under its owner before the room loaded seeds the binding: another user announcing it is dropped and the owner passes', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  await waitForCommit({ services: server.services, documentId });
  clientIds.forEach((yjsClientId) =>
    server.services.updateLog.observeClientIdentity({ documentName: documentId, yjsClientId, userId: owner.id, actor: ClientActor.Human }),
  );
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const attacker = await connectWatched({ server, documentId, cookie: editor.cookie });
  attacker.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: attacker.roomName, clientIds })));
  attacker.client.provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: attacker.client.document.clientID })).toBe(0);
  expect(awarenessStateCount({ server, clientIds })).toBe(0);
  const victim = await connectWatched({ server, documentId, cookie: owner.cookie });
  victim.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: victim.roomName, clientIds })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  expect(attacker.closedSocket()).toBeNull();
  attacker.client.close();
  victim.client.close();
  await server.stop();
});

test('a frame of 64 fresh ids from one connection closes it for the ids cap and binds none of them', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  await waitForCommit({ services: server.services, documentId });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const anchor = await connectWatched({ server, documentId, cookie: owner.cookie });
  const flooder = await connectWatched({ server, documentId, cookie: editor.cookie });
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: MAX_AWARENESS_ENTRIES_PER_FRAME });
  flooder.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: flooder.roomName, clientIds })));
  await expect.poll(flooder.closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_IDS_REASON });
  anchor.webSocket.send(
    new Uint8Array(awarenessFrameClaiming({ roomName: anchor.roomName, clientIds: [CLAIMED_ID_BASE], clock: REPLAY_CLOCK })),
  );
  await expect.poll(() => awarenessStateCount({ server, clientIds: [CLAIMED_ID_BASE] })).toBe(1);
  expect(anchor.closedSocket()).toBeNull();
  anchor.client.close();
  await server.stop();
});

test('a second connection of the same user updating an awareness id that a half-open first one holds takes the id over and stays open', async () => {
  const { server, clientIds, holder, intruder } = await holderOfClaimedIds({ hasSameUser: true });
  intruder.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: REPLAY_CLOCK })));
  const { provider, document } = intruder.client;
  provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: document.clientID })).toBe(0);
  expect(intruder.closedSocket()).toBeNull();
  expect(holder.closedSocket()).toBeNull();
  intruder.client.close();
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(0);
  holder.client.close();
  await server.stop();
});

test('a member sending a clock of 2 to the 53 for the ids of its peers is dropped and keeps its socket', async () => {
  const scenario = await holderOfClaimedIds({ hasSameUser: false });
  const { clientIds, intruder } = scenario;
  intruder.webSocket.send(
    new Uint8Array(awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: PINNED_CLOCK, state: null })),
  );
  await expectDropped(scenario);
  scenario.holder.client.close();
  intruder.client.close();
  await scenario.server.stop();
});

test('a member removing its peers at a clock just under 2 to the 52 is dropped and nobody is closed', async () => {
  const scenario = await holderOfClaimedIds({ hasSameUser: false });
  const { clientIds, intruder } = scenario;
  const removal = awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: JUST_UNDER_CEILING_CLOCK, state: null });
  intruder.webSocket.send(new Uint8Array(removal));
  await expectDropped(scenario);
  scenario.holder.client.close();
  intruder.client.close();
  await scenario.server.stop();
});

test('a member sending a clock of 2 to the 53 for ids it announced itself keeps the socket open', async () => {
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  const { server, client, closedSocket } = await sendClaimingFrame({ clientIds, clock: PINNED_CLOCK });
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  expect(closedSocket()).toBeNull();
  client.close();
  await server.stop();
});

test('an entry cut inside its state closes the socket with the entries reason and the room records nothing', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const connection = await connectWatched({ server, documentId, cookie: owner.cookie });
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: 2 });
  const frame = awarenessFrameClaiming({ roomName: connection.roomName, clientIds });
  connection.webSocket.send(new Uint8Array(frame.subarray(0, frame.length - TRUNCATED_STATE_BYTES)));
  await expect.poll(connection.closedSocket).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ENTRIES_REASON });
  expect(clientIds.some((clientId) => isKnownToAwareness({ server, clientId }))).toBe(false);
  connection.client.close();
  await server.stop();
});

test('a null entry sent first for an id recorded for another user is dropped, so the author still binds it and a later forgery is dropped', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  await waitForCommit({ services: server.services, documentId });
  clientIds.forEach((yjsClientId) =>
    server.services.updateLog.declareClientIdentity({ documentName: documentId, yjsClientId, userId: owner.id, actor: ClientActor.Human }),
  );
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const attacker = await connectWatched({ server, documentId, cookie: editor.cookie });
  const unbind = awarenessFrameClaiming({ roomName: attacker.roomName, clientIds, clock: HELD_CLOCK, state: null });
  attacker.webSocket.send(new Uint8Array(unbind));
  const victim = await connectWatched({ server, documentId, cookie: owner.cookie });
  victim.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: victim.roomName, clientIds })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  const forgery = awarenessFrameClaiming({ roomName: attacker.roomName, clientIds, clock: PINNED_CLOCK, state: FORGED_STATE });
  attacker.webSocket.send(new Uint8Array(forgery));
  attacker.client.provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: attacker.client.document.clientID })).toBe(0);
  expect(highestAwarenessClock({ server, clientIds })).toBeLessThan(REPLAY_CLOCK);
  expect(attacker.closedSocket()).toBeNull();
  expect(victim.closedSocket()).toBeNull();
  attacker.client.close();
  victim.client.close();
  await server.stop();
});

test('an id another user claimed with a null entry and then an update is bound to that user, and the owner announcing it later keeps its socket', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const clientIds = claimedIds({ base: CLAIMED_ID_BASE, count: REPLAYED_ID_COUNT });
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  await waitForCommit({ services: server.services, documentId });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const attacker = await connectWatched({ server, documentId, cookie: editor.cookie });
  const victim = await connectWatched({ server, documentId, cookie: owner.cookie });
  attacker.webSocket.send(
    new Uint8Array(awarenessFrameClaiming({ roomName: attacker.roomName, clientIds, clock: HELD_CLOCK, state: null })),
  );
  attacker.webSocket.send(new Uint8Array(awarenessFrameClaiming({ roomName: attacker.roomName, clientIds, clock: REPLAY_CLOCK })));
  await expect.poll(() => awarenessStateCount({ server, clientIds })).toBe(clientIds.length);
  victim.webSocket.send(
    new Uint8Array(awarenessFrameClaiming({ roomName: victim.roomName, clientIds, clock: REPLAY_CLOCK + 1, state: FORGED_STATE })),
  );
  victim.client.provider.setAwarenessField('cursor', 0);
  await expect.poll(() => serverCursorOf({ server, clientId: victim.client.document.clientID })).toBe(0);
  expect(victim.closedSockets().map(({ code }) => code)).not.toContain(POLICY_VIOLATION_CLOSE_CODE);
  expect(victim.webSocket.readyState).toBe(WebSocket.OPEN);
  expect(attacker.closedSocket()).toBeNull();
  attacker.client.close();
  victim.client.close();
  await server.stop();
});

test('a connection relaying an awareness state at the clock the room already holds keeps the socket open', async () => {
  const { server, clientIds, holder, intruder } = await holderOfClaimedIds({ hasSameUser: false });
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

test('a connection removing an awareness id that another live connection holds, as a reconnect queue does, keeps the socket open', async () => {
  const { server, clientIds, holder, intruder } = await holderOfClaimedIds({ hasSameUser: false });
  const removal = awarenessFrameClaiming({ roomName: intruder.roomName, clientIds, clock: HELD_CLOCK, state: null });
  intruder.webSocket.send(new Uint8Array(removal));
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
  expect(connection.closedSockets().length).toBeGreaterThan(0);
  expect(connection.closedSockets().map(({ code }) => code)).not.toContain(POLICY_VIOLATION_CLOSE_CODE);
  expect(anchor.closedSocket()).toBeNull();
  connection.client.close();
  anchor.client.close();
  await server.stop();
});
