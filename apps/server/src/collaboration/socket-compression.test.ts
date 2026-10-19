import { commitBootstrap as markBootstrapCommitted } from '@superdoc-collab/history/testing';
import { ApiPath, ClientActor, MAX_SOCKET_MESSAGE_BYTES } from '@superdoc-collab/types';
import { connect } from 'node:net';
import { describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { connectToDocument, documentWithOwner } from '../testing/collaboration-client';

const LOOPBACK_HOST = '127.0.0.1';
const DEFLATE_EXTENSION = 'permessage-deflate';
const EXTENSIONS_HEADER = 'sec-websocket-extensions';
const REPEATED_SENTENCE = 'The quick brown fox jumps over the lazy dog while the committee reviews every clause again. ';
const REPEAT_COUNT = 20_000;
const MINIMUM_SHRINK_FACTOR = 4;
const PAYLOAD_TOO_BIG_CLOSE_CODE = 1009;
const TEXT_NAME = 't';
const TEST_TIMEOUT_MS = 60_000;

type ClientSocketInternals = { _isServer: boolean; _socket: { bytesRead: number } };

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
    `Sec-WebSocket-Extensions: ${DEFLATE_EXTENSION}; client_max_window_bits`,
    '',
    '',
  ].join('\r\n');
}

function upgradeResponseHeaders({ baseUrl, cookie }: { baseUrl: string; cookie: string }): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK_HOST, port: Number(new URL(baseUrl).port) });
    socket.on('connect', () => socket.write(upgradeRequest({ path: ApiPath.Collaboration, origin: baseUrl, cookie })));
    socket.once('data', (chunk) => {
      resolve(chunk.toString().toLowerCase());
      socket.destroy();
    });
    socket.on('error', () => socket.destroy());
  });
}

describe('collaboration socket compression', () => {
  test('the upgrade response negotiates permessage-deflate', { timeout: TEST_TIMEOUT_MS }, async () => {
    const { server, owner } = await documentWithOwner();
    const headers = await upgradeResponseHeaders({ baseUrl: server.baseUrl, cookie: owner.cookie });
    expect(headers).toContain(`${EXTENSIONS_HEADER}: ${DEFLATE_EXTENSION}`);
    await server.stop();
  });

  test('a large sync reaches the joiner intact and far smaller on the wire than decompressed', { timeout: TEST_TIMEOUT_MS }, async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const text = REPEATED_SENTENCE.repeat(REPEAT_COUNT);
    const seeded = new Y.Doc();
    markBootstrapCommitted(seeded);
    seeded.getText(TEXT_NAME).insert(0, text);
    const state = Y.encodeStateAsUpdate(seeded);
    server.services.updateLog.appendCommitted({
      documentName: documentId,
      connectionUserId: owner.id,
      connectionActor: ClientActor.Human,
      update: state,
      state,
    });
    const clientSockets: ClientSocketInternals[] = [];
    const setSocket = WebSocket.prototype.setSocket;
    const spy = vi.spyOn(WebSocket.prototype, 'setSocket').mockImplementation(function (this: WebSocket, ...parameters) {
      const internals = this as unknown as ClientSocketInternals;
      setSocket.apply(this, parameters);
      if (!internals._isServer) clientSockets.push(internals);
    });
    const joiner = await connectToDocument({ server, cookie: owner.cookie, documentId, ticket: null });
    spy.mockRestore();
    expect(joiner.document.getText(TEXT_NAME).toString()).toBe(text);
    const [clientSocket] = clientSockets;
    expect(clientSocket!._socket.bytesRead * MINIMUM_SHRINK_FACTOR).toBeLessThan(state.length);
    joiner.close();
    await server.stop();
  });

  test('a frame small on the wire and over the payload cap once decompressed closes with 1009', { timeout: TEST_TIMEOUT_MS }, async () => {
    const { server, owner } = await documentWithOwner();
    const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, {
      origin: server.baseUrl,
      headers: { cookie: owner.cookie },
      perMessageDeflate: true,
      maxPayload: 2 * MAX_SOCKET_MESSAGE_BYTES,
    });
    socket.on('error', () => undefined);
    const closeCode = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
    const negotiated = new Promise<string>((resolve) =>
      socket.on('open', () => {
        resolve(socket.extensions);
        socket.send(Buffer.alloc(MAX_SOCKET_MESSAGE_BYTES + 1));
      }),
    );
    expect(await negotiated).toContain(DEFLATE_EXTENSION);
    expect(await closeCode).toBe(PAYLOAD_TOO_BIG_CLOSE_CODE);
    await server.stop();
  });
});
