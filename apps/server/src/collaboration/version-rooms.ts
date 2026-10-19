import { Hocuspocus } from '@hocuspocus/server';
import {
  ACCESS_REVOKED_CLOSE_CODE,
  ACCESS_REVOKED_REASON,
  ApiPath,
  SECOND_MS,
  VERSION_ROOM_IDLE_MS,
  VERSION_ROOMS_LIMIT,
} from '@superdoc-collab/types';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import { versionKeyOf, versionKeyPrefixOf, type VersionEndpoint, type VersionsService } from '../history/versions-service';
import { LruMap } from '../limits/lru-map';
import { withTimeout } from '../limits/with-timeout';
import { describeError } from '../logging/describe-error';
import { authenticateMember, CollaborationAuthenticationError } from './authenticate-member';
import { COLLABORATION_SOCKET_TIMEOUT_MS, LOADING_ORIGIN } from './collaboration-server';
import { DOCUMENT_ID_PATTERN, documentIdFromRoomName } from './room-name';

const SEQUENCE_PATTERN = /^[1-9]\d{0,15}$/;
const VERSION_PATH_PREFIX = `${ApiPath.Collaboration}/versions/`;
const PATH_SEPARATOR = '/';
const STOP_TIMEOUT_MS = 5 * SECOND_MS;
const ROOM_DESTROY_FAILED_MESSAGE = 'Destroying a version instance failed for';

export type VersionRoomPolicy = { idleMs: number; limit: number };
type VersionRoomContext = { userId: string; documentId: string };
type VersionRoom = { hocuspocus: Hocuspocus; idleTimer: NodeJS.Timeout | null };

export const DEFAULT_VERSION_ROOM_POLICY: VersionRoomPolicy = { idleMs: VERSION_ROOM_IDLE_MS, limit: VERSION_ROOMS_LIMIT };

export function parseVersionPath(pathname: string): VersionEndpoint | null {
  if (!pathname.startsWith(VERSION_PATH_PREFIX)) return null;
  const [documentId, sequenceText, ...rest] = pathname.slice(VERSION_PATH_PREFIX.length).split(PATH_SEPARATOR);
  const isVersionPath =
    rest.length === 0 &&
    documentId !== undefined &&
    DOCUMENT_ID_PATTERN.test(documentId) &&
    sequenceText !== undefined &&
    SEQUENCE_PATTERN.test(sequenceText);
  if (!isVersionPath) return null;
  return { documentId, sequence: Number(sequenceText) };
}

export enum VersionAdmission {
  Allowed = 'allowed',
  Refused = 'refused',
  Unavailable = 'unavailable',
}

export class VersionRooms {
  private readonly rooms: LruMap<VersionRoom>;
  private readonly auth: Auth;
  private readonly documents: DocumentsRepository;
  private readonly versions: VersionsService;
  private readonly policy: VersionRoomPolicy;

  constructor({
    auth,
    documents,
    versions,
    policy,
  }: {
    auth: Auth;
    documents: DocumentsRepository;
    versions: VersionsService;
    policy: VersionRoomPolicy;
  }) {
    this.auth = auth;
    this.documents = documents;
    this.versions = versions;
    this.policy = policy;
    this.rooms = new LruMap({ isOverBudget: (rooms) => rooms.size > policy.limit });
  }

  async authorize({ endpoint, request }: { endpoint: VersionEndpoint; request: IncomingMessage }): Promise<VersionAdmission> {
    try {
      await authenticateMember({
        auth: this.auth,
        documents: this.documents,
        cookie: request.headers.cookie,
        documentId: endpoint.documentId,
      });
    } catch {
      return VersionAdmission.Refused;
    }
    const mark = this.versions.resolve(endpoint);
    if (mark === null || mark.sequence !== endpoint.sequence) return VersionAdmission.Refused;
    if (this.versions.hasFailedRecently(endpoint)) return VersionAdmission.Unavailable;
    return VersionAdmission.Allowed;
  }

  handle({ endpoint, webSocket, request }: { endpoint: VersionEndpoint; webSocket: WebSocket; request: IncomingMessage }): void {
    this.roomFor(endpoint).hocuspocus.handleConnection(webSocket, request);
  }

  closeUser({ documentId, userId }: { documentId: string; userId: string }): void {
    const prefix = versionKeyPrefixOf(documentId);
    this.rooms
      .keys()
      .filter((key) => key.startsWith(prefix))
      .flatMap((key) => [...this.rooms.peek(key)!.hocuspocus.documents.values()])
      .flatMap((room) => [...room.connections.values()].map(({ connection }) => connection))
      .filter((connection) => (connection.context as VersionRoomContext).userId === userId)
      .forEach((connection) => connection.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON }));
  }

  size(): number {
    return this.rooms.size();
  }

  async forget(documentId: string): Promise<void> {
    const prefix = versionKeyPrefixOf(documentId);
    await Promise.all(
      this.rooms
        .keys()
        .filter((key) => key.startsWith(prefix))
        .map((key) => this.destroy(key)),
    );
  }

  async stop(): Promise<void> {
    const destroyed = Promise.all(this.rooms.keys().map((key) => this.destroy(key))).then(() => undefined);
    await withTimeout({ work: destroyed, milliseconds: STOP_TIMEOUT_MS, onTimeout: () => undefined });
  }

  private roomFor(endpoint: VersionEndpoint): VersionRoom {
    const key = versionKeyOf(endpoint);
    const existing = this.rooms.get(key);
    const room = existing ? existing : this.create({ key, endpoint });
    this.rooms
      .set({ key, value: room })
      .forEach((evicted) => this.destroyInBackground({ key: evicted.key, destroying: this.destroyRoom(evicted.value) }));
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
    return {
      hocuspocus,
      idleTimer: setTimeout(() => this.destroyInBackground({ key, destroying: this.destroy(key) }), this.policy.idleMs),
    };
  }

  private cancelIdle(key: string): void {
    const room = this.rooms.peek(key);
    if (!room || !room.idleTimer) return;
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }

  private scheduleIdle(key: string): void {
    const room = this.rooms.peek(key);
    if (!room) return;
    this.cancelIdle(key);
    room.idleTimer = setTimeout(() => this.destroyInBackground({ key, destroying: this.destroy(key) }), this.policy.idleMs);
  }

  private destroyInBackground({ key, destroying }: { key: string; destroying: Promise<void> }): void {
    destroying.catch((error) => console.error(`${ROOM_DESTROY_FAILED_MESSAGE} ${key}: ${describeError(error)}`));
  }

  private async destroy(key: string): Promise<void> {
    const room = this.rooms.peek(key);
    if (!room) return;
    this.rooms.delete(key);
    await this.destroyRoom(room);
  }

  private async destroyRoom(room: VersionRoom): Promise<void> {
    if (room.idleTimer) clearTimeout(room.idleTimer);
    await room.hocuspocus.destroy();
  }
}
