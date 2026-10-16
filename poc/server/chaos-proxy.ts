import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

export type LinkConditions = {
  latencyMs: number;
  jitterMs: number;
};

type Link = {
  userKey: string;
  client: WebSocket;
  upstream: WebSocket;
};

type DelayedChannel = {
  send: (data: RawData) => void;
};

const NO_DELAY: LinkConditions = { latencyMs: 0, jitterMs: 0 };

function createDelayedChannel({ target, conditions }: { target: WebSocket; conditions: () => LinkConditions }): DelayedChannel {
  let nextDeliveryAt = 0;
  return {
    send(data) {
      const { latencyMs, jitterMs } = conditions();
      const now = Date.now();
      nextDeliveryAt = Math.max(nextDeliveryAt, now + latencyMs + Math.random() * jitterMs);
      setTimeout(() => {
        if (target.readyState === WebSocket.OPEN) target.send(data);
      }, nextDeliveryAt - now);
    },
  };
}

export class ChaosProxy {
  private readonly httpServer: Server;
  private readonly socketServer = new WebSocketServer({ noServer: true });
  private readonly conditionsByUser = new Map<string, LinkConditions>();
  private readonly cutUsers = new Set<string>();
  private readonly links = new Set<Link>();
  connectionsByUser = new Map<string, number>();

  constructor(private readonly options: { listenPort: number; targetUrl: string }) {
    this.httpServer = createServer();
    this.httpServer.on('upgrade', (request, socket, head) => this.handleUpgrade({ socket, head, request }));
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve) => this.httpServer.listen(this.options.listenPort, '127.0.0.1', resolve));
  }

  async close(): Promise<void> {
    this.links.forEach((link) => this.terminate(link));
    await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
  }

  setConditions({ userKey, conditions }: { userKey: string; conditions: LinkConditions }): void {
    this.conditionsByUser.set(userKey, conditions);
  }

  cut(userKey: string): void {
    this.cutUsers.add(userKey);
    [...this.links].filter((link) => link.userKey === userKey).forEach((link) => this.terminate(link));
  }

  heal(userKey: string): void {
    this.cutUsers.delete(userKey);
  }

  private conditionsFor(userKey: string): LinkConditions {
    const conditions = this.conditionsByUser.get(userKey);
    if (!conditions) return NO_DELAY;
    return conditions;
  }

  private terminate(link: Link): void {
    this.links.delete(link);
    link.client.terminate();
    link.upstream.terminate();
  }

  private handleUpgrade({ socket, head, request }: { socket: Duplex; head: Buffer; request: IncomingMessage }): void {
    if (!request.url) throw new Error('Upgrade request without URL.');
    const userKey = request.url.split('/')[1].split('?')[0];
    if (this.cutUsers.has(userKey)) {
      socket.destroy();
      return;
    }
    this.socketServer.handleUpgrade(request, socket, head, (client) => this.bridge({ userKey, client }));
  }

  private bridge({ userKey, client }: { userKey: string; client: WebSocket }): void {
    const previousConnections = this.connectionsByUser.get(userKey);
    this.connectionsByUser.set(userKey, previousConnections === undefined ? 1 : previousConnections + 1);
    const upstream = new WebSocket(this.options.targetUrl);
    const link: Link = { userKey, client, upstream };
    this.links.add(link);
    const conditions = () => this.conditionsFor(userKey);
    const toUpstream = createDelayedChannel({ target: upstream, conditions });
    const toClient = createDelayedChannel({ target: client, conditions });
    const pendingFromClient: RawData[] = [];
    client.on('message', (data) => {
      if (upstream.readyState !== WebSocket.OPEN) {
        pendingFromClient.push(data);
        return;
      }
      toUpstream.send(data);
    });
    upstream.on('open', () => pendingFromClient.splice(0).forEach((data) => toUpstream.send(data)));
    upstream.on('message', (data) => toClient.send(data));
    client.on('close', () => this.terminate(link));
    upstream.on('close', () => this.terminate(link));
    client.on('error', () => this.terminate(link));
    upstream.on('error', () => this.terminate(link));
  }
}
