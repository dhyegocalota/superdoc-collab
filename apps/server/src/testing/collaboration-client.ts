import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import {
  ApiPath,
  COLLABORATION_TOKEN_PLACEHOLDER,
  CREATOR_ATTEMPT_QUERY_KEY,
  CREATOR_EPOCH_QUERY_KEY,
  type DocumentRole,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import * as Y from 'yjs';
import type { CreatorTicket } from '../collaboration/creator-reservations';
import type { VersionRoomPolicy } from '../collaboration/version-rooms';
import type { LanguageModelChoice } from '../insights/llm-client';
import { SUPERDOC_ROOM_PREFIX } from '../collaboration/room-name';
import { signedInOwner, signedInUser, type TestServer, type TestUser } from './test-server';

const DOCUMENT_TITLE = 'Shared plan';
const MEMBER_NAME = 'Member';
const ticketsByCookieAndDocument = new Map<string, CreatorTicket>();

function ticketKey({ cookie, documentId }: { cookie: string; documentId: string }): string {
  return `${cookie}|${documentId}`;
}

function registeredTicket({ cookie, documentId }: { cookie: string; documentId: string }): CreatorTicket | null {
  const ticket = ticketsByCookieAndDocument.get(ticketKey({ cookie, documentId }));
  if (ticket === undefined) return null;
  return ticket;
}

function ticketQuery(ticket: CreatorTicket | null): string {
  if (ticket === null) return '';
  return `?${new URLSearchParams({ [CREATOR_ATTEMPT_QUERY_KEY]: String(ticket.attempt), [CREATOR_EPOCH_QUERY_KEY]: ticket.epoch })}`;
}

export function reserveOwner({ server, documentId, owner }: { server: TestServer; documentId: string; owner: TestUser }): CreatorTicket {
  const ticket = server.services.reservations.reserve({ documentId, userId: owner.id });
  if (ticket === null) throw new Error(`The room ${documentId} is already reserved.`);
  ticketsByCookieAndDocument.set(ticketKey({ cookie: owner.cookie, documentId }), ticket);
  return ticket;
}

export type ClosedSocket = { code: number; reason: string };

export type CollaborationClient = { document: Y.Doc; provider: HocuspocusProvider; closed: Promise<ClosedSocket>; close: () => void };

export class CollaborationRefusedError extends Error {
  readonly closeCode: number | null;

  constructor({ closeCode = null }: { closeCode?: number | null } = {}) {
    super('The collaboration server refused the connection.');
    this.closeCode = closeCode;
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
  ticket,
}: {
  server: TestServer;
  headers: Record<string, string>;
  origin: string | undefined;
  token: string;
  documentId: string;
  document: Y.Doc;
  path: string;
  ticket: CreatorTicket | null;
}): Promise<CollaborationClient> {
  return new Promise((resolve, reject) => {
    let isSynced = false;
    let reportClosed: (closedSocket: ClosedSocket) => void = () => undefined;
    const closed = new Promise<ClosedSocket>((resolveClosed) => {
      reportClosed = resolveClosed;
    });
    const websocketProvider = new HocuspocusProviderWebsocket({
      url: server.baseUrl.replace('http', 'ws') + path + ticketQuery(ticket),
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
      onAuthenticationFailed: () => {
        close();
        reject(new CollaborationRefusedError());
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
  path = ApiPath.Collaboration,
  ticket = registeredTicket({ cookie, documentId }),
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
  document?: Y.Doc;
  origin?: string;
  path?: string;
  ticket?: CreatorTicket | null;
}): Promise<CollaborationClient> {
  return openProvider({
    server,
    headers: { cookie },
    origin,
    token: COLLABORATION_TOKEN_PLACEHOLDER,
    documentId,
    document,
    path,
    ticket,
  });
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
  return openProvider({ server, headers: {}, origin: undefined, token, documentId, document, path, ticket: null });
}

export async function documentWithOwner({
  languageModel,
  versionRoomPolicy,
}: { languageModel?: LanguageModelChoice; versionRoomPolicy?: VersionRoomPolicy } = {}): Promise<{
  server: TestServer;
  documentId: string;
  owner: TestUser;
}> {
  const { server, owner } = await signedInOwner({ languageModel, versionRoomPolicy });
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: DOCUMENT_TITLE, ownerUserId: owner.id });
  reserveOwner({ server, documentId, owner });
  return { server, documentId, owner };
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
