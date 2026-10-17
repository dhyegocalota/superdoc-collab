import { ApiPath, HttpStatus, RETRY_AFTER_HEADER, SECOND_MS, VERSION_FAILURE_TTL_MS, versionCollaborationPath } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';
import { editedAfterBootstrap } from '../testing/timeline-client';
import { VersionAdmission } from './version-rooms';

const LOOPBACK_HOST = '127.0.0.1';
const UNMASKED_BINARY_FRAME = Buffer.from([0x82, 0x01, 0x00]);
const FOREIGN_ORIGIN = 'https://evil.example';
const HEALTH_OK_STATUS = 200;
const UNAUTHENTICATED_CLOSE_DEADLINE_MS = 12_000;
const UNAUTHENTICATED_TEST_TIMEOUT_MS = 15_000;
const SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS = 15_000;
const DECODE_FAILURE = 'decode failed';

function upgradeRequest({ path, origin, cookie }: { path: string; origin: string; cookie: string }): string {
  return [`GET ${path} HTTP/1.1`, `Host: ${LOOPBACK_HOST}`, `Origin: ${origin}`, `Cookie: ${cookie}`, 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', '', ''].join('\r\n');
}

function exchange({ server, path, origin = server.baseUrl, cookie = '', followUp = null }: { server: TestServer; path: string; origin?: string; cookie?: string; followUp?: Buffer | null }): Promise<string> {
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

function firstChunk({ server, path, cookie }: { server: TestServer; path: string; cookie: string }): Promise<string> {
  const { port } = new URL(server.baseUrl);
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
    socket.on('connect', () => socket.write(upgradeRequest({ path, origin: server.baseUrl, cookie })));
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
  test('an upgrade from a foreign origin with a valid session cookie is destroyed', { timeout: SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS }, async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Carla' });
    const response = await exchange({ server, path: ApiPath.Collaboration, origin: FOREIGN_ORIGIN, cookie });
    expect(response).toBe('');
    await server.stop();
  });
  test('an upgrade without an origin is destroyed', async () => {
    const server = await startTestServer();
    const response = await exchange({ server, path: ApiPath.Collaboration, origin: '' });
    expect(response).toBe('');
    await server.stop();
  });
  test('a socket that never authenticates is closed by the server', { timeout: UNAUTHENTICATED_TEST_TIMEOUT_MS }, async () => {
    const server = await startTestServer();
    const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, { origin: server.baseUrl });
    const startedAt = Date.now();
    await new Promise<void>((resolve) => socket.on('close', () => resolve()));
    await server.stop();
    expect(Date.now() - startedAt).toBeLessThan(UNAUTHENTICATED_CLOSE_DEADLINE_MS);
  });
  test('a client that resets the socket while the version upgrade is authorized does not crash the server', async () => {
    const server = await startTestServer();
    const { cookie } = await signedInUser({ server, name: 'Dora' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const authorize = vi.spyOn(server.services.versionRooms, 'authorize').mockImplementation(() => gate.then(() => VersionAdmission.Refused));
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);
    try {
      const { port } = new URL(server.baseUrl);
      const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
      socket.on('error', () => undefined);
      socket.on('connect', () => socket.write(upgradeRequest({ path: versionCollaborationPath({ documentId: randomUUID(), sequence: 1 }), origin: server.baseUrl, cookie })));
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
  test('a version that failed to load recently is refused with 503 before the upgrade', { timeout: SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS }, async () => {
    const { server, documentId, owner, client } = await editedAfterBootstrap();
    const [mark] = server.services.readModel.marks(documentId);
    const endpoint = { documentId, sequence: mark!.sequence };
    vi.spyOn(server.services.scheduler, 'version').mockRejectedValue(new Error(DECODE_FAILURE));
    await expect(server.services.versions.load(endpoint)).rejects.toThrow(DECODE_FAILURE);
    const response = await firstChunk({ server, path: versionCollaborationPath(endpoint), cookie: owner.cookie });
    expect(response.startsWith(`HTTP/1.1 ${HttpStatus.ServiceUnavailable}`)).toBe(true);
    expect(response).toContain(`${RETRY_AFTER_HEADER}: ${VERSION_FAILURE_TTL_MS / SECOND_MS}`);
    expect(server.services.versionRooms.size()).toBe(0);
    client.close();
    await server.stop();
  });
  test('a client that resets while the 503 is written does not crash the server', { timeout: SIGNED_IN_UPGRADE_TEST_TIMEOUT_MS }, async () => {
    const { server, documentId, owner, client } = await editedAfterBootstrap();
    const [mark] = server.services.readModel.marks(documentId);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const authorize = vi.spyOn(server.services.versionRooms, 'authorize').mockImplementation(() => gate.then(() => VersionAdmission.Unavailable));
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);
    try {
      const { port } = new URL(server.baseUrl);
      const socket = connect({ host: LOOPBACK_HOST, port: Number(port) });
      socket.on('error', () => undefined);
      socket.on('connect', () => socket.write(upgradeRequest({ path: versionCollaborationPath({ documentId, sequence: mark!.sequence }), origin: server.baseUrl, cookie: owner.cookie })));
      await expect.poll(() => authorize.mock.calls.length).toBe(1);
      socket.resetAndDestroy();
      release();
      expect(await healthStatus(server)).toBe(HEALTH_OK_STATUS);
    } finally {
      process.off('uncaughtException', uncaught);
    }
    expect(uncaught).not.toHaveBeenCalled();
    client.close();
    await server.stop();
  });
});
