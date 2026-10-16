import type { Hocuspocus } from '@hocuspocus/server';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';

const PARSE_BASE_URL = 'http://localhost';

export function attachCollaboration({ httpServer, hocuspocus, path }: { httpServer: Server; hocuspocus: Hocuspocus; path: string }): void {
  const sockets = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url) return socket.destroy();
    const { pathname } = new URL(request.url, PARSE_BASE_URL);
    if (pathname !== path) return socket.destroy();
    sockets.handleUpgrade(request, socket, head, (webSocket) => hocuspocus.handleConnection(webSocket, request));
  });
}
