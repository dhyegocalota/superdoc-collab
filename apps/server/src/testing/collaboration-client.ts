import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { ApiPath, COLLABORATION_TOKEN_PLACEHOLDER, RoomMode, type DocumentRole } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import * as Y from 'yjs';
import type { VersionRoomPolicy } from '../collaboration/version-rooms';
import type { LanguageModelChoice } from '../insights/llm-client';
import { SUPERDOC_ROOM_PREFIX } from '../collaboration/room-name';
import { signedInOwner, signedInUser, type TestServer, type TestUser } from './test-server';

const DOCUMENT_TITLE = 'Shared plan';
const MEMBER_NAME = 'Member';
const bootstrapTokensByCookieAndDocument = new Map<string, string>();

function tokenKey({ cookie, documentId }: { cookie: string; documentId: string }): string {
  return `${cookie}|${documentId}`;
}

function registeredBootstrapToken({
  server,
  cookie,
  documentId,
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
}): string | null {
  const token = bootstrapTokensByCookieAndDocument.get(tokenKey({ cookie, documentId }));
  if (token === undefined) return null;
  const isCommitted = server.services.runtime.roomMode(documentId) === RoomMode.Join;
  if (isCommitted) return null;
  return token;
}

export function beginOwnerBootstrap({ server, documentId, owner }: { server: TestServer; documentId: string; owner: TestUser }): string {
  const token = server.services.roomBootstrap.begin(documentId);
  bootstrapTokensByCookieAndDocument.set(tokenKey({ cookie: owner.cookie, documentId }), token);
  return token;
}

type ClosedSocket = { code: number; reason: string };

export type CollaborationClient = { document: Y.Doc; provider: HocuspocusProvider; closed: Promise<ClosedSocket>; close: () => void };

export class CollaborationRefusedError extends Error {
  readonly closeCode: number | null;
  readonly reason: string | null;

  constructor({ closeCode = null, reason = null }: { closeCode?: number | null; reason?: string | null } = {}) {
    super('The collaboration server refused the connection.');
    this.closeCode = closeCode;
    this.reason = reason;
  }
}

function socketWithHeaders({ headers, origin }: { headers: Record<string, string>; origin: string | undefined }): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers, origin });
      this.on('error', () => undefined);
    }
  } as unknown as typeof WebSocket;
}

function openProvider({
  server,
  headers,
  origin,
  token,
  documentId,
  document,
  path,
}: {
  server: TestServer;
  headers: Record<string, string>;
  origin: string | undefined;
  token: string;
  documentId: string;
  document: Y.Doc;
  path: string;
}): Promise<CollaborationClient> {
  return new Promise((resolve, reject) => {
    let isSynced = false;
    let reportClosed: (closedSocket: ClosedSocket) => void = () => undefined;
    const closed = new Promise<ClosedSocket>((resolveClosed) => {
      reportClosed = resolveClosed;
    });
    const websocketProvider = new HocuspocusProviderWebsocket({
      url: server.baseUrl.replace('http', 'ws') + path,
      WebSocketPolyfill: socketWithHeaders({ headers, origin }),
      maxAttempts: 1,
      connect: false,
    });
    const provider = new HocuspocusProvider({
      websocketProvider,
      document,
      name: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      token,
      onSynced: () => {
        isSynced = true;
        resolve({ document, provider, closed, close });
      },
      onAuthenticationFailed: ({ reason }) => {
        close();
        reject(new CollaborationRefusedError({ reason }));
      },
      onClose: ({ event }) => {
        reportClosed({ code: event.code, reason: event.reason });
        if (isSynced) return;
        close();
        reject(new CollaborationRefusedError({ closeCode: event.code }));
      },
    });
    const connectWithoutRejection = websocketProvider.connect.bind(websocketProvider);
    websocketProvider.connect = () => connectWithoutRejection().catch(() => undefined);
    websocketProvider.connect();
    function close(): void {
      provider.destroy();
      websocketProvider.destroy();
    }
  });
}

export function connectToDocument({
  server,
  cookie,
  documentId,
  document = new Y.Doc(),
  origin = server.baseUrl,
  path,
  bootstrapToken = registeredBootstrapToken({ server, cookie, documentId }),
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
  document?: Y.Doc;
  origin?: string;
  path?: string;
  bootstrapToken?: string | null;
}): Promise<CollaborationClient> {
  const isBootstrapping = bootstrapToken !== null && path === undefined;
  if (isBootstrapping) return connectAsBootstrap({ server, token: bootstrapToken, documentId, document });
  const socketPath = path === undefined ? ApiPath.Collaboration : path;
  return openProvider({
    server,
    headers: { cookie },
    origin,
    token: COLLABORATION_TOKEN_PLACEHOLDER,
    documentId,
    document,
    path: socketPath,
  });
}

export function connectAsBootstrap({
  server,
  token,
  documentId,
  document = new Y.Doc(),
  path = ApiPath.BootstrapCollaboration,
}: {
  server: TestServer;
  token: string;
  documentId: string;
  document?: Y.Doc;
  path?: string;
}): Promise<CollaborationClient> {
  return openProvider({ server, headers: {}, origin: undefined, token, documentId, document, path });
}

export function connectAgentToDocument({
  server,
  token,
  documentId,
  document = new Y.Doc(),
  path = ApiPath.AgentCollaboration,
}: {
  server: TestServer;
  token: string;
  documentId: string;
  document?: Y.Doc;
  path?: string;
}): Promise<CollaborationClient> {
  return openProvider({ server, headers: {}, origin: undefined, token, documentId, document, path });
}

export async function documentWithOwner({
  languageModel,
  versionRoomPolicy,
}: { languageModel?: LanguageModelChoice; versionRoomPolicy?: VersionRoomPolicy } = {}): Promise<{
  server: TestServer;
  documentId: string;
  owner: TestUser;
  bootstrapToken: string;
}> {
  const { server, owner } = await signedInOwner({ languageModel, versionRoomPolicy });
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: DOCUMENT_TITLE, ownerUserId: owner.id });
  const bootstrapToken = beginOwnerBootstrap({ server, documentId, owner });
  return { server, documentId, owner, bootstrapToken };
}

export async function memberWithRole({
  server,
  documentId,
  role,
}: {
  server: TestServer;
  documentId: string;
  role: DocumentRole;
}): Promise<TestUser> {
  const member = await signedInUser({ server, name: MEMBER_NAME });
  server.services.documents.grant({ documentId, userId: member.id, role });
  return member;
}
