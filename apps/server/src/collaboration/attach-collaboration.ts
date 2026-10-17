import type { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  POLICY_VIOLATION_CLOSE_CODE,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SOCKET_RATE_LIMIT_REASON,
  VERSION_FAILURE_TTL_MS,
} from '@superdoc-collab/types';
import { WebSocket, WebSocketServer } from 'ws';
import { describeError } from '../logging/describe-error';
import type { VersionEndpoint } from '../history/versions-service';
import { SocketMessageLimit } from './socket-message-limit';
import { isAgentUpgrade, isLoopbackAddress, upgradePathname } from './upgrade-path';
import { parseVersionPath, VersionAdmission, type VersionRooms } from './version-rooms';

const SOCKET_ERROR_MESSAGE = 'Collaboration socket failed';
const SOCKET_RATE_LIMIT_LOG = 'Collaboration socket closed for sending too many messages';

const UNAVAILABLE_UPGRADE_RESPONSE = [
  `HTTP/1.1 ${HttpStatus.ServiceUnavailable} Service Unavailable`,
  `${RETRY_AFTER_HEADER}: ${VERSION_FAILURE_TTL_MS / SECOND_MS}`,
  'Connection: close',
  'Content-Length: 0',
  '',
  '',
].join('\r\n');

function terminateOnError(this: WebSocket, error: Error): void {
  console.warn(`${SOCKET_ERROR_MESSAGE}: ${describeError(error)}`);
  if (this.readyState === WebSocket.CLOSING) return;
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
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_MESSAGE_BYTES });
  const messageLimit = new SocketMessageLimit();
  function closeOnBreach(this: WebSocket): void {
    if (!messageLimit.breached(this)) return;
    console.warn(SOCKET_RATE_LIMIT_LOG);
    this.removeAllListeners('message');
    this.close(POLICY_VIOLATION_CLOSE_CODE, SOCKET_RATE_LIMIT_REASON);
  }
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
      webSocket.on('message', closeOnBreach);
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
    const pathname = upgradePathname(request.url);
    if (isAgentUpgrade(request.url) && !isLoopbackAddress(request.socket.remoteAddress)) return socket.destroy();
    if (isAgentUpgrade(request.url)) return upgrade({ request, socket, head, endpoint: null });
    if (request.headers.origin !== allowedOrigin) return socket.destroy();
    const endpoint = parseVersionPath(pathname);
    if (endpoint) return void upgradeVersion({ request, socket, head, endpoint });
    if (pathname !== path) return socket.destroy();
    upgrade({ request, socket, head, endpoint: null });
  });
  return sockets;
}
