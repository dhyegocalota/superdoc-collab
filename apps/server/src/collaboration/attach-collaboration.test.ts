import {
  ApiPath,
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  MAX_SOCKET_MESSAGES_PER_SECOND,
  POLICY_VIOLATION_CLOSE_CODE,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SOCKET_RATE_LIMIT_REASON,
  VERSION_FAILURE_TTL_MS,
  versionCollaborationPath,
} from '@superdoc-collab/types';
import { OutgoingMessage, type Hocuspocus } from '@hocuspocus/server';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import { Duplex } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { CollaborationRefusedError, connectAgentToDocument, connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';
import { editedAfterBootstrap } from '../testing/timeline-client';
import { SUPERDOC_ROOM_PREFIX } from './room-name';
import { attachCollaboration } from './attach-collaboration';
import { VersionAdmission, type VersionRooms } from './version-rooms';

const LOOPBACK_HOST = '127.0.0.1';
const UNMASKED_BINARY_FRAME = Buffer.from([0x82, 0x01, 0x00]);
const FOREIGN_ORIGIN = 'https://evil.example';
const HEALTH_OK_STATUS = 200;
const SHORT_SOCKET_TIMEOUT_MS = 300;
const UNAUTHENTICATED_CLOSE_DEADLINE_MS = 8_000;
const UNAUTHORIZED_CLOSE_CODE = 4401;
const SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS = 15_000;
const DECODE_FAILURE = 'decode failed';
const RESET_FAILURE = 'ECONNRESET';
const ORIGIN = 'http://app.test';
const FOREIGN_ADDRESS = '203.0.113.9';
const PAYLOAD_TOO_BIG_CLOSE_CODE = 1009;
const FRAME_OVERHEAD_BYTES = 1024;
const PADDED_UPDATE_TEST_TIMEOUT_MS = 60_000;
const SECRET_PAYLOAD_TEXT = 'secret-payload-text';
const FLOOD_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const FLOOD_ROOM_NAME = `${SUPERDOC_ROOM_PREFIX}${FLOOD_DOCUMENT_ID}`;

function validUpdateFrame(): Buffer {
  const document = new Y.Doc();
  document.getText('t').insert(0, SECRET_PAYLOAD_TEXT);
  const message = new OutgoingMessage(FLOOD_ROOM_NAME).createSyncMessage().writeUpdate(Y.encodeStateAsUpdate(document));
  return Buffer.from(message.toUint8Array());
}

function openFloodSocket(server: TestServer): { socket: WebSocket; closed: Promise<{ code: number; reason: string }> } {
  const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, { origin: server.baseUrl });
  socket.on('error', () => undefined);
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  return { socket, closed };
}

function closeCodeAfterSending({ server, frame }: { server: TestServer; frame: Buffer }): Promise<number> {
  const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, {
    origin: server.baseUrl,
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const closeCode = await closeCodeAfterSending({ server, frame: Buffer.alloc(MAX_SOCKET_MESSAGE_BYTES + 1) });
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
  test('121 frames before authentication close the socket with 1008, are not applied and are logged without the payload', async () => {
    const server = await startTestServer();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { socket, closed } = openFloodSocket(server);
    await new Promise((resolve) => socket.on('open', resolve));
    const frame = validUpdateFrame();
    Array.from({ length: MAX_SOCKET_MESSAGES_PER_SECOND + 1 }).forEach(() => socket.send(frame));
    expect(await closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_RATE_LIMIT_REASON });
    expect(server.services.updateLog.hasUpdates(FLOOD_DOCUMENT_ID)).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET_PAYLOAD_TEXT);
    warn.mockRestore();
    await server.stop();
  });
  test('121 valid awareness frames close the socket with 1008 and the reason', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
    Array.from({ length: MAX_SOCKET_MESSAGES_PER_SECOND + 1 }).forEach((_, index) => client.provider.setAwarenessField('cursor', index));
    expect(await client.closed).toEqual({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_RATE_LIMIT_REASON });
    warn.mockRestore();
    client.close();
    await server.stop();
  });
  test('a malformed frame after the upgrade does not crash the server', async () => {
    const server = await startTestServer();
    const response = await exchange({ server, path: ApiPath.Collaboration, followUp: UNMASKED_BINARY_FRAME });
    expect(response).toContain('101');
    expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
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
    server.services.hocuspocus.configuration.timeout = SHORT_SOCKET_TIMEOUT_MS;
    const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, {
      origin: server.baseUrl,
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
