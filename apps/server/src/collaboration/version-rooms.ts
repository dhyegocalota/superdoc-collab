import { Hocuspocus } from '@hocuspocus/server';
import { ApiPath, VERSION_ROOM_IDLE_MS, VERSION_ROOMS_LIMIT } from '@superdoc-history/types';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import type { VersionsService } from '../history/versions-service';
import { authenticateMember, CollaborationAuthenticationError } from './authenticate-member';
import { COLLABORATION_SOCKET_TIMEOUT_MS, LOADING_ORIGIN } from './collaboration-server';
import { DOCUMENT_ID_PATTERN, documentIdFromRoomName } from './room-name';

const SEQUENCE_PATTERN = /^[1-9]\d{0,15}$/;
const VERSION_PATH_PREFIX = `${ApiPath.Collaboration}/versions/`;
const PATH_SEPARATOR = '/';
const STOP_TIMEOUT_MS = 5000;

export type VersionEndpoint = { documentId: string; sequence: number };
export type VersionRoomPolicy = { idleMs: number; limit: number };
type VersionRoom = { hocuspocus: Hocuspocus; idleTimer: NodeJS.Timeout | null };

export const DEFAULT_VERSION_ROOM_POLICY: VersionRoomPolicy = { idleMs: VERSION_ROOM_IDLE_MS, limit: VERSION_ROOMS_LIMIT };

export function parseVersionPath(pathname: string): VersionEndpoint | null {
  if (!pathname.startsWith(VERSION_PATH_PREFIX)) return null;
  const [documentId, sequenceText, ...rest] = pathname.slice(VERSION_PATH_PREFIX.length).split(PATH_SEPARATOR);
  const isVersionPath = rest.length === 0 && documentId !== undefined && DOCUMENT_ID_PATTERN.test(documentId) && sequenceText !== undefined && SEQUENCE_PATTERN.test(sequenceText);
  if (!isVersionPath) return null;
  return { documentId, sequence: Number(sequenceText) };
}

function keyOf({ documentId, sequence }: VersionEndpoint): string {
  return `${documentId}${PATH_SEPARATOR}${sequence}`;
}

export class VersionRooms {
  private readonly rooms = new Map<string, VersionRoom>();
  private readonly auth: Auth;
  private readonly documents: DocumentsRepository;
  private readonly versions: VersionsService;
  private readonly policy: VersionRoomPolicy;

  constructor({ auth, documents, versions, policy }: { auth: Auth; documents: DocumentsRepository; versions: VersionsService; policy: VersionRoomPolicy }) {
    this.auth = auth;
    this.documents = documents;
    this.versions = versions;
    this.policy = policy;
  }

  async authorize({ endpoint, request }: { endpoint: VersionEndpoint; request: IncomingMessage }): Promise<boolean> {
    try {
      await authenticateMember({ auth: this.auth, documents: this.documents, cookie: request.headers.cookie, documentId: endpoint.documentId });
    } catch {
      return false;
    }
    const mark = this.versions.resolve(endpoint);
    return mark !== null && mark.sequence === endpoint.sequence;
  }

  handle({ endpoint, webSocket, request }: { endpoint: VersionEndpoint; webSocket: WebSocket; request: IncomingMessage }): void {
    this.roomFor(endpoint).hocuspocus.handleConnection(webSocket, request);
  }

  size(): number {
    return this.rooms.size;
  }

  async forget(documentId: string): Promise<void> {
    const prefix = `${documentId}${PATH_SEPARATOR}`;
    await Promise.all([...this.rooms.keys()].filter((key) => key.startsWith(prefix)).map((key) => this.destroy(key)));
  }

  async stop(): Promise<void> {
    const destroyed = Promise.all([...this.rooms.keys()].map((key) => this.destroy(key)));
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS).unref());
    await Promise.race([destroyed, timeout]);
  }

  private roomFor(endpoint: VersionEndpoint): VersionRoom {
    const key = keyOf(endpoint);
    const existing = this.rooms.get(key);
    const room = existing ? existing : this.create({ key, endpoint });
    this.rooms.delete(key);
    this.rooms.set(key, room);
    [...this.rooms.keys()].slice(0, Math.max(0, this.rooms.size - this.policy.limit)).forEach((evicted) => void this.destroy(evicted));
    return room;
  }

  private create({ key, endpoint }: { key: string; endpoint: VersionEndpoint }): VersionRoom {
    const { auth, documents, versions } = this;
    const hocuspocus = new Hocuspocus({
      quiet: true,
      timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
      async onAuthenticate({ requestHeaders, documentName, connection }) {
        const { userId } = await authenticateMember({ auth, documents, cookie: requestHeaders.cookie, documentId: endpoint.documentId });
        if (documentIdFromRoomName(documentName) !== endpoint.documentId) throw new CollaborationAuthenticationError();
        connection.readOnly = true;
        return { userId, documentId: endpoint.documentId };
      },
      async onLoadDocument({ document }) {
        Y.applyUpdate(document, (await versions.load(endpoint)).state, LOADING_ORIGIN);
      },
      connected: async () => this.cancelIdle(key),
      afterUnloadDocument: async () => this.scheduleIdle(key),
    });
    return { hocuspocus, idleTimer: setTimeout(() => void this.destroy(key), this.policy.idleMs) };
  }

  private cancelIdle(key: string): void {
    const room = this.rooms.get(key);
    if (!room || !room.idleTimer) return;
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }

  private scheduleIdle(key: string): void {
    const room = this.rooms.get(key);
    if (!room) return;
    this.cancelIdle(key);
    room.idleTimer = setTimeout(() => void this.destroy(key), this.policy.idleMs);
  }

  private async destroy(key: string): Promise<void> {
    const room = this.rooms.get(key);
    if (!room) return;
    this.rooms.delete(key);
    if (room.idleTimer) clearTimeout(room.idleTimer);
    await room.hocuspocus.destroy();
  }
}
