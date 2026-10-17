import type { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { HttpStatus, RETRY_AFTER_HEADER, SECOND_MS, VERSION_FAILURE_TTL_MS } from '@superdoc-collab/types';
import { WebSocketServer, type WebSocket } from 'ws';
import type { VersionEndpoint } from '../history/versions-service';
import { parseVersionPath, VersionAdmission, type VersionRooms } from './version-rooms';

const PARSE_BASE_URL = 'http://localhost';
const UNAVAILABLE_UPGRADE_RESPONSE = [
  `HTTP/1.1 ${HttpStatus.ServiceUnavailable} Service Unavailable`,
  `${RETRY_AFTER_HEADER}: ${VERSION_FAILURE_TTL_MS / SECOND_MS}`,
  'Connection: close',
  'Content-Length: 0',
  '',
  '',
].join('\r\n');

function terminateOnError(this: WebSocket): void {
  this.terminate();
}

function destroyOnSocketError(this: Duplex): void {
  this.destroy();
}

export function attachCollaboration({
  httpServer,
  hocuspocus,
  versionRooms,
  path,
  allowedOrigin,
}: {
  httpServer: Server;
  hocuspocus: Hocuspocus;
  versionRooms: VersionRooms;
  path: string;
  allowedOrigin: string;
}): WebSocketServer {
  const sockets = new WebSocketServer({ noServer: true });
  function upgrade({
    request,
    socket,
    head,
    endpoint,
  }: {
    request: IncomingMessage;
    socket: Duplex;
    head: Buffer;
    endpoint: VersionEndpoint | null;
  }): void {
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on('error', terminateOnError);
      if (endpoint) return versionRooms.handle({ endpoint, webSocket, request });
      hocuspocus.handleConnection(webSocket, request);
    });
  }
  async function upgradeVersion({
    request,
    socket,
    head,
    endpoint,
  }: {
    request: IncomingMessage;
    socket: Duplex;
    head: Buffer;
    endpoint: VersionEndpoint;
  }): Promise<void> {
    socket.on('error', destroyOnSocketError);
    const admission = await versionRooms.authorize({ endpoint, request }).catch(() => VersionAdmission.Refused);
    if (admission === VersionAdmission.Unavailable) {
      socket.end(UNAVAILABLE_UPGRADE_RESPONSE);
      return;
    }
    socket.removeListener('error', destroyOnSocketError);
    if (admission === VersionAdmission.Refused) {
      socket.destroy();
      return;
    }
    upgrade({ request, socket, head, endpoint });
  }
  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url) return socket.destroy();
    if (request.headers.origin !== allowedOrigin) return socket.destroy();
    const { pathname } = new URL(request.url, PARSE_BASE_URL);
    const endpoint = parseVersionPath(pathname);
    if (endpoint) return void upgradeVersion({ request, socket, head, endpoint });
    if (pathname !== path) return socket.destroy();
    upgrade({ request, socket, head, endpoint: null });
  });
  return sockets;
}
