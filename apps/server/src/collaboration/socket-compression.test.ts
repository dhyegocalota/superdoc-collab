import { commitBootstrap as markBootstrapCommitted } from '@superdoc-collab/history/testing';
import {
  ApiPath,
  ClientActor,
  COLLABORATION_TOKEN_PLACEHOLDER,
  MAX_SOCKET_MESSAGE_BYTES,
  POLICY_VIOLATION_CLOSE_CODE,
} from '@superdoc-collab/types';
import { connect, type Socket } from 'node:net';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { PRE_AUTHENTICATION_MAX_INFLATED_BYTES } from './socket-message-limit';
import { documentWithOwner } from '../testing/collaboration-client';
import { commitBootstrap, waitForCommit } from '../testing/committed-room';
import type { TestServer } from '../testing/test-server';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const LOOPBACK_HOST = '127.0.0.1';
const DEFLATE_EXTENSION = 'permessage-deflate';
const EXTENSIONS_HEADER = 'sec-websocket-extensions';
const REPEATED_SENTENCE = 'The quick brown fox jumps over the lazy dog while the committee reviews every clause again. ';
const REPEAT_COUNT = 20_000;
const MINIMUM_SHRINK_FACTOR = 4;
const PAYLOAD_TOO_BIG_CLOSE_CODE = 1009;
const TEXT_NAME = 't';
const TEST_TIMEOUT_MS = 60_000;
const SOCKET_WINDOW_BITS = 12;
const INFLATING_FRAMES = 2;
const INFLATING_FRAME_BYTES = (MAX_SOCKET_MESSAGE_BYTES * 3) / 4;
const SETTLE_AFTER_FRAMES_MS = 3_000;

type UpgradeObserver = { sockets: Socket[]; webSockets: WebSocket[] };

function observingSocketClass({
  cookie,
  origin,
  observer,
}: {
  cookie: string;
  origin: string;
  observer: UpgradeObserver;
}): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie }, origin });
      this.on('error', () => undefined);
      observer.webSockets.push(this);
      this.on('upgrade', (response) => observer.sockets.push(response.socket));
    }
  } as unknown as typeof WebSocket;
}

function joinObservingBytes({
  server,
  cookie,
  documentId,
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
}): Promise<{ document: Y.Doc; observer: UpgradeObserver; close: () => void }> {
  const observer: UpgradeObserver = { sockets: [], webSockets: [] };
  const document = new Y.Doc();
  return new Promise((resolve) => {
    const websocketProvider = new HocuspocusProviderWebsocket({
      url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration,
      WebSocketPolyfill: observingSocketClass({ cookie, origin: server.baseUrl, observer }),
      maxAttempts: 1,
    });
    const provider = new HocuspocusProvider({
      websocketProvider,
      document,
      name: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      token: COLLABORATION_TOKEN_PLACEHOLDER,
      onSynced: () =>
        resolve({
          document,
          observer,
          close: () => {
            provider.destroy();
            websocketProvider.destroy();
          },
        }),
    });
  });
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

function inflatingFrames(): Buffer[] {
  return Array.from({ length: INFLATING_FRAMES }, () => Buffer.alloc(INFLATING_FRAME_BYTES));
}

function sendFrames({
  server,
  path,
  headers,
  frames,
}: {
  server: TestServer;
  path: string;
  headers: Record<string, string>;
  frames: Buffer[];
}): Promise<{ closeCode: number | null }> {
  const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${path}`, {
    origin: server.baseUrl,
    headers,
    perMessageDeflate: true,
  });
  socket.on('error', () => undefined);
  socket.on('open', () => frames.forEach((frame) => socket.send(frame)));
  return new Promise((resolve) => {
    socket.on('close', (code) => resolve({ closeCode: code }));
    setTimeout(() => resolve({ closeCode: null }), SETTLE_AFTER_FRAMES_MS);
  });
}

describe('collaboration socket compression', () => {
  test('the upgrade response negotiates permessage-deflate', { timeout: TEST_TIMEOUT_MS }, async () => {
    const { server, owner } = await documentWithOwner();
    const headers = await upgradeResponseHeaders({ baseUrl: server.baseUrl, cookie: owner.cookie });
    expect(headers).toContain(`${EXTENSIONS_HEADER}: ${DEFLATE_EXTENSION}`);
    expect(headers).toContain(`server_max_window_bits=${SOCKET_WINDOW_BITS}`);
    expect(headers).toContain(`client_max_window_bits=${SOCKET_WINDOW_BITS}`);
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
    const joiner = await joinObservingBytes({ server, cookie: owner.cookie, documentId });
    expect(joiner.document.getText(TEXT_NAME).toString()).toBe(text);
    const [wire] = joiner.observer.sockets;
    expect(wire!.bytesRead * MINIMUM_SHRINK_FACTOR).toBeLessThan(state.length);
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
    const negotiated = new Promise<string | string[] | undefined>((resolve) =>
      socket.on('upgrade', (response) => resolve(response.headers[EXTENSIONS_HEADER])),
    );
    socket.on('open', () => socket.send(Buffer.alloc(MAX_SOCKET_MESSAGE_BYTES + 1)));
    expect(await negotiated).toContain(DEFLATE_EXTENSION);
    expect(await closeCode).toBe(PAYLOAD_TOO_BIG_CLOSE_CODE);
    await server.stop();
  });

  test(
    'an authenticated socket whose frames inflate past the budget within a second is closed with 1008',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const { server, documentId, owner } = await documentWithOwner();
      commitBootstrap({ services: server.services, documentId, userId: owner.id });
      await waitForCommit({ services: server.services, documentId });
      const joiner = await joinObservingBytes({ server, cookie: owner.cookie, documentId });
      const [webSocket] = joiner.observer.webSockets;
      const closeCode = new Promise<number>((resolve) => webSocket!.on('close', (code) => resolve(code)));
      inflatingFrames().forEach((frame) => webSocket!.send(frame));
      expect(await closeCode).toBe(POLICY_VIOLATION_CLOSE_CODE);
      joiner.close();
      await server.stop();
    },
  );

  test('the loopback bootstrap socket is exempt from the inflated budget', { timeout: TEST_TIMEOUT_MS }, async () => {
    const { server } = await documentWithOwner();
    const { closeCode } = await sendFrames({ server, path: ApiPath.BootstrapCollaboration, headers: {}, frames: inflatingFrames() });
    expect(closeCode).not.toBe(POLICY_VIOLATION_CLOSE_CODE);
    await server.stop();
  });

  test(
    'a frame inflating past the pre-authentication total on a socket that never authenticates closes it with 1008',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const { server, owner } = await documentWithOwner();
      const { closeCode } = await sendFrames({
        server,
        path: ApiPath.Collaboration,
        headers: { cookie: owner.cookie },
        frames: [Buffer.alloc(PRE_AUTHENTICATION_MAX_INFLATED_BYTES + 1)],
      });
      expect(closeCode).toBe(POLICY_VIOLATION_CLOSE_CODE);
      await server.stop();
    },
  );
});
