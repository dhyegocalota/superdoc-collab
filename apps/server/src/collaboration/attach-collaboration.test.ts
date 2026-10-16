import { ApiPath } from '@superdoc-history/types';
import { connect } from 'node:net';
import { describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';

const LOOPBACK_HOST = '127.0.0.1';
const UNMASKED_BINARY_FRAME = Buffer.from([0x82, 0x01, 0x00]);
const FOREIGN_ORIGIN = 'https://evil.example';
const HEALTH_OK_STATUS = 200;
const UNAUTHENTICATED_CLOSE_DEADLINE_MS = 12_000;
const UNAUTHENTICATED_TEST_TIMEOUT_MS = 15_000;

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
  test('an upgrade from a foreign origin with a valid session cookie is destroyed', { timeout: UNAUTHENTICATED_TEST_TIMEOUT_MS }, async () => {
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
});
