import type { Hocuspocus } from '@hocuspocus/server';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

const PARSE_BASE_URL = 'http://localhost';

function terminateOnError(this: WebSocket): void {
  this.terminate();
}

export function attachCollaboration({ httpServer, hocuspocus, path, allowedOrigin }: { httpServer: Server; hocuspocus: Hocuspocus; path: string; allowedOrigin: string }): WebSocketServer {
  const sockets = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url) return socket.destroy();
    if (request.headers.origin !== allowedOrigin) return socket.destroy();
    const { pathname } = new URL(request.url, PARSE_BASE_URL);
    if (pathname !== path) return socket.destroy();
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on('error', terminateOnError);
      hocuspocus.handleConnection(webSocket, request);
    });
  });
  return sockets;
}
