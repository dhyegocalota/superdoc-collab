import type { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { constants } from 'node:zlib';
import {
  HEAVY_ROOMS_FULL_CLOSE_CODE,
  HEAVY_ROOMS_FULL_REASON,
  HEAVY_ROOMS_USER_CAP_CLOSE_CODE,
  HEAVY_ROOMS_USER_CAP_REASON,
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  PUBLIC_MAX_SOCKET_MESSAGE_BYTES,
  POLICY_VIOLATION_CLOSE_CODE,
  RETRY_AFTER_HEADER,
  secondsRoundedUp,
  SECOND_MS,
  SOCKET_AWARENESS_ENTRIES_REASON,
  SOCKET_CLOSE_GRACE_MS,
  SOCKET_RATE_LIMIT_REASON,
  UNAUTHORIZED_CLOSE_CODE,
  UNAUTHORIZED_CLOSE_REASON,
  VERSION_FAILURE_TTL_MS,
} from '@superdoc-collab/types';
import { WebSocket, WebSocketServer, type PerMessageDeflateOptions, type RawData, type ServerOptions } from 'ws';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';
import { addressWindowKeyOf, clientAddressOf, FORWARDED_FOR_HEADER } from '../http/client-address';
import type { KeyedSlidingWindow } from '../limits/keyed-sliding-window';
import { describeError } from '../logging/describe-error';
import type { VersionEndpoint } from '../history/versions-service';
import { scrubOutgoingAwareness } from './awareness-scrub';
import { AuthReply, authReplyOf, deniedReasonOf } from './auth-reply';
import { SocketMessageLimit } from './socket-message-limit';
import { isAgentUpgrade, isBootstrapUpgrade, isLoopbackAddress, isPublicUpgrade, upgradePathname } from './upgrade-path';
import { parseVersionPath, VersionAdmission, type VersionRooms } from './version-rooms';

const SOCKET_COMPRESSION_THRESHOLD_BYTES = 1024;
const SOCKET_COMPRESSION_CONCURRENCY = 4;
const SOCKET_COMPRESSION_WINDOW_BITS = 12;
const SOCKET_COMPRESSION_MEMORY_LEVEL = 3;
const SOCKET_COMPRESSION_OPTIONS: PerMessageDeflateOptions = {
  threshold: SOCKET_COMPRESSION_THRESHOLD_BYTES,
  concurrencyLimit: SOCKET_COMPRESSION_CONCURRENCY,
  zlibDeflateOptions: { level: constants.Z_BEST_SPEED, memLevel: SOCKET_COMPRESSION_MEMORY_LEVEL },
  serverMaxWindowBits: SOCKET_COMPRESSION_WINDOW_BITS,
  clientMaxWindowBits: SOCKET_COMPRESSION_WINDOW_BITS,
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
};
const SOCKET_SERVER_OPTIONS: ServerOptions & { closeTimeout: number } = {
  noServer: true,
  maxPayload: MAX_SOCKET_MESSAGE_BYTES,
  perMessageDeflate: SOCKET_COMPRESSION_OPTIONS,
  closeTimeout: SOCKET_CLOSE_GRACE_MS,
};
const PUBLIC_SOCKET_SERVER_OPTIONS: ServerOptions & { closeTimeout: number } = {
  ...SOCKET_SERVER_OPTIONS,
  maxPayload: PUBLIC_MAX_SOCKET_MESSAGE_BYTES,
};
const SOCKET_ERROR_MESSAGE = 'Collaboration socket failed';
const SOCKET_RATE_LIMIT_LOG = 'Collaboration socket closed for sending too many messages';
const SOCKET_INFLATED_BUDGET_LOG = 'Collaboration socket closed for inflating too many bytes';
const SOCKET_DENIED_LOG = 'Collaboration socket closed after the server denied it';
const SOCKET_DENIED_REASON = 'Permission denied';
const SOCKET_AWARENESS_ENTRIES_LOG = 'Collaboration socket closed for claiming too many awareness entries in one frame';
const MESSAGE_EVENT = 'message';
const CLOSE_CODE_BY_HEAVY_ROOMS_REASON = new Map<string, number>([
  [HEAVY_ROOMS_FULL_REASON, HEAVY_ROOMS_FULL_CLOSE_CODE],
  [HEAVY_ROOMS_USER_CAP_REASON, HEAVY_ROOMS_USER_CAP_CLOSE_CODE],
]);

const UNAVAILABLE_UPGRADE_RESPONSE = [
  `HTTP/1.1 ${HttpStatus.ServiceUnavailable} Service Unavailable`,
  `${RETRY_AFTER_HEADER}: ${VERSION_FAILURE_TTL_MS / SECOND_MS}`,
  'Connection: close',
  'Content-Length: 0',
  '',
  '',
].join('\r\n');

function tooManyRequestsResponse(retryAfterSeconds: number): string {
  return [
    `HTTP/1.1 ${HttpStatus.TooManyRequests} Too Many Requests`,
    `${RETRY_AFTER_HEADER}: ${retryAfterSeconds}`,
    'Connection: close',
    'Content-Length: 0',
    '',
    '',
  ].join('\r\n');
}

function terminateOnError(this: WebSocket, error: Error): void {
  console.warn(`${SOCKET_ERROR_MESSAGE}: ${describeError(error)}`);
  if (this.readyState === WebSocket.CLOSING) return;
  this.terminate();
}

function destroyOnSocketError(this: Duplex): void {
  this.destroy();
}

export type PublicAdmission = { window: KeyedSlidingWindow; trustProxy: boolean; trustedProxyHops: number; pseudonymSecret: string };

export function attachCollaboration({
  httpServer,
  auth,
  hocuspocus,
  versionRooms,
  publicAdmission,
  path,
  allowedOrigin,
}: {
  httpServer: Server;
  auth: Auth;
  hocuspocus: Hocuspocus;
  versionRooms: VersionRooms;
  publicAdmission: PublicAdmission;
  path: string;
  allowedOrigin: string;
}): WebSocketServer[] {
  const sockets = new WebSocketServer(SOCKET_SERVER_OPTIONS);
  const publicSockets = new WebSocketServer(PUBLIC_SOCKET_SERVER_OPTIONS);
  const messageLimit = new SocketMessageLimit();
  function closeOnBreach(this: WebSocket, frame: RawData): void {
    if (!messageLimit.breached({ socket: this, frame })) return;
    console.warn(SOCKET_RATE_LIMIT_LOG);
    this.removeAllListeners(MESSAGE_EVENT);
    this.close(POLICY_VIOLATION_CLOSE_CODE, SOCKET_RATE_LIMIT_REASON);
  }
  function reactToAuthReply({ webSocket, isPublicSocket }: { webSocket: WebSocket; isPublicSocket: boolean }): void {
    const send = webSocket.send.bind(webSocket) as (...parameters: unknown[]) => void;
    webSocket.send = ((...parameters: unknown[]) => {
      const reply = authReplyOf(parameters[0] as Uint8Array);
      if (reply === AuthReply.Authenticated) messageLimit.markAuthenticated(webSocket);
      send(...parameters);
      if (reply === AuthReply.Other) return;
      Reflect.deleteProperty(webSocket, 'send');
      if (isPublicSocket && reply === AuthReply.Authenticated)
        scrubOutgoingAwareness({ webSocket, secret: publicAdmission.pseudonymSecret });
      if (reply !== AuthReply.Denied) return;
      console.warn(SOCKET_DENIED_LOG);
      const deniedReason = deniedReasonOf(parameters[0] as Uint8Array);
      const closeCode = deniedReason === null ? undefined : CLOSE_CODE_BY_HEAVY_ROOMS_REASON.get(deniedReason);
      if (deniedReason !== null && closeCode !== undefined) return void webSocket.close(closeCode, deniedReason);
      webSocket.close(POLICY_VIOLATION_CLOSE_CODE, SOCKET_DENIED_REASON);
    }) as WebSocket['send'];
  }
  function withholdOverclaims({ webSocket, isBootstrapSocket }: { webSocket: WebSocket; isBootstrapSocket: boolean }): void {
    const emit = webSocket.emit.bind(webSocket);
    webSocket.emit = (event: string | symbol, ...parameters: unknown[]): boolean => {
      const isMessage = event === MESSAGE_EVENT;
      const isReceivedAfterClose = isMessage && webSocket.readyState !== WebSocket.OPEN;
      if (isReceivedAfterClose) return false;
      const isInflationChecked = isMessage && !isBootstrapSocket;
      const isOverBudget = isInflationChecked && messageLimit.exceedsInflatedBudget({ socket: webSocket, frame: parameters[0] as RawData });
      const isOverBeforeAnswer =
        isInflationChecked && messageLimit.exceedsPreAuthenticationBudget({ socket: webSocket, frame: parameters[0] as RawData });
      if (isOverBudget || isOverBeforeAnswer) {
        console.warn(SOCKET_INFLATED_BUDGET_LOG);
        webSocket.removeAllListeners(MESSAGE_EVENT);
        webSocket.close(POLICY_VIOLATION_CLOSE_CODE, SOCKET_RATE_LIMIT_REASON);
        return false;
      }
      const isOverclaim = isMessage && messageLimit.claimsTooManyEntries(parameters[0] as RawData);
      if (!isOverclaim) return emit(event, ...parameters);
      console.warn(SOCKET_AWARENESS_ENTRIES_LOG);
      webSocket.removeAllListeners(MESSAGE_EVENT);
      webSocket.close(POLICY_VIOLATION_CLOSE_CODE, SOCKET_AWARENESS_ENTRIES_REASON);
      return false;
    };
  }
  function upgrade({
    request,
    socket,
    head,
    endpoint,
    socketServer = sockets,
  }: {
    request: IncomingMessage;
    socket: Duplex;
    head: Buffer;
    endpoint: VersionEndpoint | null;
    socketServer?: WebSocketServer;
  }): void {
    const isBootstrapSocket = request.url !== undefined && isBootstrapUpgrade(request.url);
    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on('error', terminateOnError);
      webSocket.on(MESSAGE_EVENT, closeOnBreach);
      reactToAuthReply({ webSocket, isPublicSocket: socketServer === publicSockets });
      if (endpoint) messageLimit.markAuthenticated(webSocket);
      withholdOverclaims({ webSocket, isBootstrapSocket });
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
  function refuseSession({ request, socket, head }: { request: IncomingMessage; socket: Duplex; head: Buffer }): void {
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on('error', terminateOnError);
      webSocket.close(UNAUTHORIZED_CLOSE_CODE, UNAUTHORIZED_CLOSE_REASON);
    });
  }
  async function upgradeMember({ request, socket, head }: { request: IncomingMessage; socket: Duplex; head: Buffer }): Promise<void> {
    const { cookie } = request.headers;
    if (!cookie) return void socket.destroy();
    socket.on('error', destroyOnSocketError);
    const lookup = await readSession({ auth, headers: new Headers({ cookie }) }).then(
      (session) => ({ isFailed: false, session }),
      () => ({ isFailed: true, session: null }),
    );
    socket.removeListener('error', destroyOnSocketError);
    if (lookup.isFailed) return void socket.destroy();
    if (!lookup.session) return refuseSession({ request, socket, head });
    upgrade({ request, socket, head, endpoint: null });
  }
  function upgradePublic({ request, socket, head }: { request: IncomingMessage; socket: Duplex; head: Buffer }): void {
    const { remoteAddress } = request.socket;
    if (remoteAddress === undefined) return void socket.destroy();
    const address = addressWindowKeyOf(
      clientAddressOf({
        forwardedFor: request.headers[FORWARDED_FOR_HEADER],
        remoteAddress,
        trustProxy: publicAdmission.trustProxy,
        trustedProxyHops: publicAdmission.trustedProxyHops,
      }),
    );
    const waitMs = publicAdmission.window.waitMs(address);
    if (waitMs !== null) {
      socket.on('error', destroyOnSocketError);
      return void socket.end(tooManyRequestsResponse(secondsRoundedUp(waitMs)));
    }
    publicAdmission.window.record(address);
    upgrade({ request, socket, head, endpoint: null, socketServer: publicSockets });
  }
  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url) return socket.destroy();
    const pathname = upgradePathname(request.url);
    const isLoopbackOnly = isAgentUpgrade(request.url) || isBootstrapUpgrade(request.url);
    if (isLoopbackOnly && !isLoopbackAddress(request.socket.remoteAddress)) return socket.destroy();
    if (isLoopbackOnly) return upgrade({ request, socket, head, endpoint: null });
    if (request.headers.origin !== allowedOrigin) return socket.destroy();
    if (isPublicUpgrade(request.url)) return upgradePublic({ request, socket, head });
    const endpoint = parseVersionPath(pathname);
    if (endpoint) return void upgradeVersion({ request, socket, head, endpoint });
    if (pathname !== path) return socket.destroy();
    void upgradeMember({ request, socket, head });
  });
  return [sockets, publicSockets];
}
