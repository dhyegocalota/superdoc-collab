import type { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseVersionPath, type VersionEndpoint, type VersionRooms } from './version-rooms';

const PARSE_BASE_URL = 'http://localhost';

function terminateOnError(this: WebSocket): void {
  this.terminate();
}

function destroyOnSocketError(this: Duplex): void {
  this.destroy();
}

export function attachCollaboration({ httpServer, hocuspocus, versionRooms, path, allowedOrigin }: { httpServer: Server; hocuspocus: Hocuspocus; versionRooms: VersionRooms; path: string; allowedOrigin: string }): WebSocketServer {
  const sockets = new WebSocketServer({ noServer: true });
  function upgrade({ request, socket, head, endpoint }: { request: IncomingMessage; socket: Duplex; head: Buffer; endpoint: VersionEndpoint | null }): void {
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on('error', terminateOnError);
      if (endpoint) return versionRooms.handle({ endpoint, webSocket, request });
      hocuspocus.handleConnection(webSocket, request);
    });
  }
  function upgradeVersion({ request, socket, head, endpoint }: { request: IncomingMessage; socket: Duplex; head: Buffer; endpoint: VersionEndpoint }): void {
    socket.on('error', destroyOnSocketError);
    versionRooms.authorize({ endpoint, request }).then(
      (isAllowed) => {
        socket.removeListener('error', destroyOnSocketError);
        if (!isAllowed) return socket.destroy();
        upgrade({ request, socket, head, endpoint });
      },
      () => {
        socket.removeListener('error', destroyOnSocketError);
        socket.destroy();
      },
    );
  }
  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url) return socket.destroy();
    if (request.headers.origin !== allowedOrigin) return socket.destroy();
    const { pathname } = new URL(request.url, PARSE_BASE_URL);
    const endpoint = parseVersionPath(pathname);
    if (endpoint) return upgradeVersion({ request, socket, head, endpoint });
    if (pathname !== path) return socket.destroy();
    upgrade({ request, socket, head, endpoint: null });
  });
  return sockets;
}
