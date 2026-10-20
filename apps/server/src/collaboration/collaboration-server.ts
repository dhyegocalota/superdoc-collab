import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { isBootstrapCommitted, materialize, type UpdateLog } from '@superdoc-collab/history';
import {
  ClientActor,
  DocumentRole,
  isTabId,
  MINUTE_MS,
  RoomMode,
  POLICY_VIOLATION_CLOSE_CODE,
  SECOND_MS,
  SOCKET_AWARENESS_ENTRIES_REASON,
  SOCKET_AWARENESS_IDS_REASON,
  SOCKET_SINGLE_DOCUMENT_REASON,
  TAB_QUERY_KEY,
  ACCESS_REVOKED_CLOSE_CODE,
  ACCESS_REVOKED_REASON,
  UNAUTHORIZED_CLOSE_CODE,
  UNAUTHORIZED_CLOSE_REASON,
} from '@superdoc-collab/types';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import { KeyedCooldown } from '../limits/keyed-cooldown';
import type { RoomModes } from './room-modes';
import type { BootstrapState } from './bootstrap-state';
import { authenticateAgent } from './authenticate-agent';
import { authenticateBootstrap } from './authenticate-bootstrap';
import { ImpersonationTimers } from './impersonation-timers';
import { authenticateMember, CollaborationAuthenticationError } from './authenticate-member';
import { overfullConnections } from './awareness-client-cap';
import { trackAwarenessOwners } from './awareness-origin';
import { AwarenessOwners } from './awareness-owners';
import { awarenessEntriesOf, silenceAwarenessEntries } from './frame-bucket';
import { createClientDeclarer } from './client-declarations';
import type { CollaborationContext } from './collaboration-context';
import type { RoomBootstrap } from './room-bootstrap';
import { createProcessRoomMemoryRelease, type RoomMemoryRelease } from './room-memory-release';
import { documentIdFromRoomName } from './room-name';
import { isAgentUpgrade, isBootstrapUpgrade } from './upgrade-path';

export type { CollaborationContext };

export const COLLABORATION_SOCKET_TIMEOUT_MS = 10 * SECOND_MS;
const STORE_DEBOUNCE_MS = 2 * SECOND_MS;
export const MAX_STORE_DEBOUNCE_MS = 4 * SECOND_MS;

export const LOADING_ORIGIN = 'update-log-replay';

export const OPEN_BUDGET_LOG = 'Refused a socket on an uncommitted room: the open budget of the user is spent';
const DROP_LOG_COOLDOWN_MS = MINUTE_MS;
const AWARENESS_MALFORMED_LOG = 'Collaboration socket closed for sending an awareness frame with an unreadable entry';
export const AWARENESS_DROP_LOG = 'Dropped an awareness frame that touches an awareness client another user announced';
export const AWARENESS_IDS_LOG = 'Collaboration socket closed for holding too many awareness clients';
const REFUSED_UPDATE_LOG = 'Dropped an update from a socket that may not write to the room of';
const REVOKED_CLOSE_LOG = 'Closed a socket admitted just before its member was removed from';
const STALE_BOOTSTRAP_CLOSE_LOG = 'Closed a bootstrap socket whose attempt is no longer the current one of';
export const UNCOMMITTED_REFUSAL_LOG = 'Refused a socket that is not the bootstrap on an uncommitted room';

class MalformedAwarenessError extends Error {
  readonly code = POLICY_VIOLATION_CLOSE_CODE;
  readonly reason = SOCKET_AWARENESS_ENTRIES_REASON;

  constructor() {
    super(SOCKET_AWARENESS_ENTRIES_REASON);
  }
}

class CollaborationSingleDocumentError extends Error {
  readonly code = POLICY_VIOLATION_CLOSE_CODE;
  readonly reason = SOCKET_SINGLE_DOCUMENT_REASON;

  constructor() {
    super(SOCKET_SINGLE_DOCUMENT_REASON);
  }
}

function isWriteAllowed({
  roomBootstrap,
  bootstrap,
  context,
  document,
}: {
  roomBootstrap: RoomBootstrap;
  bootstrap: BootstrapState;
  context: CollaborationContext;
  document: Y.Doc;
}): boolean {
  const { documentId, bootstrapAttempt } = context;
  if (bootstrapAttempt === null) return isBootstrapCommitted({ document }) || bootstrap.isCommitted(documentId);
  return roomBootstrap.isCurrent({ documentId, attempt: bootstrapAttempt });
}

function warnOncePerConnection({ context, warned }: { context: CollaborationContext; warned: WeakSet<CollaborationContext> }): void {
  if (warned.has(context)) return;
  warned.add(context);
  console.warn(`${REFUSED_UPDATE_LOG} ${context.documentId}`);
}

function requireDocumentId(roomName: string): string {
  const documentId = documentIdFromRoomName(roomName);
  if (!documentId) throw new CollaborationAuthenticationError();
  return documentId;
}

function tabIdOf(requestParameters: URLSearchParams): string | null {
  const tab = requestParameters.get(TAB_QUERY_KEY);
  if (tab === null || !isTabId(tab)) return null;
  return tab;
}

enum SocketKind {
  Member = 'member',
  Agent = 'agent',
  Bootstrap = 'bootstrap',
}

type Admission = { userId: string; role: DocumentRole; impersonationEndsAt: number | null; bootstrapAttempt: string | null };

function socketKindOf(request: IncomingMessage): SocketKind {
  if (!request.url) throw new CollaborationAuthenticationError();
  if (isAgentUpgrade(request.url)) return SocketKind.Agent;
  if (isBootstrapUpgrade(request.url)) return SocketKind.Bootstrap;
  return SocketKind.Member;
}

const ACTOR_BY_SOCKET_KIND: Record<SocketKind, ClientActor> = {
  [SocketKind.Member]: ClientActor.Human,
  [SocketKind.Agent]: ClientActor.Agent,
  [SocketKind.Bootstrap]: ClientActor.Human,
};

export function createCollaborationServer({
  auth,
  documents,
  updateLog,
  roomBootstrap,
  bootstrap,
  roomModes,
  onLogged,
  onStored,
  roomMemory = createProcessRoomMemoryRelease(),
}: {
  auth: Auth;
  documents: DocumentsRepository;
  updateLog: UpdateLog;
  roomBootstrap: RoomBootstrap;
  bootstrap: BootstrapState;
  roomModes: RoomModes;
  onLogged: (documentId: string) => void;
  onStored: (documentId: string) => void;
  roomMemory?: RoomMemoryRelease;
}): Hocuspocus {
  const declarer = createClientDeclarer(updateLog);
  const awarenessOwners = new AwarenessOwners();
  const dropLogCooldown = new KeyedCooldown({ durationMs: DROP_LOG_COOLDOWN_MS });
  const impersonationTimers = new ImpersonationTimers();
  const refusedConnections = new WeakSet<CollaborationContext>();
  const documentNameBySocket = new WeakMap<IncomingMessage, string>();
  const admitters: Record<
    SocketKind,
    (parameters: { requestHeaders: IncomingHttpHeaders; token: string; documentId: string }) => Promise<Admission>
  > = {
    [SocketKind.Member]: async ({ requestHeaders, documentId }) => ({
      ...(await authenticateMember({ auth, documents, cookie: requestHeaders.cookie, documentId })),
      bootstrapAttempt: null,
    }),
    [SocketKind.Agent]: async ({ token, documentId }) => ({
      ...(await authenticateAgent({ auth, documents, token, documentId })),
      impersonationEndsAt: null,
      bootstrapAttempt: null,
    }),
    [SocketKind.Bootstrap]: async ({ token, documentId }) => ({
      ...(await authenticateBootstrap({ auth, documents, roomBootstrap, bootstrap, token, documentId })),
      impersonationEndsAt: null,
    }),
  };
  function admitToCommittedRoom({ documentId, userId }: { documentId: string; userId: string }): void {
    const answer = roomModes.resolve({ documentId, userId });
    if (answer.isSpent) {
      console.warn(`${OPEN_BUDGET_LOG} ${documentId}`);
      throw new CollaborationAuthenticationError();
    }
    if (answer.roomMode === RoomMode.Join) return;
    console.warn(`${UNCOMMITTED_REFUSAL_LOG} ${documentId}`);
    throw new CollaborationAuthenticationError();
  }
  return new Hocuspocus({
    quiet: true,
    timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: MAX_STORE_DEBOUNCE_MS,
    async onConnect({ request, documentName }) {
      const firstDocumentName = documentNameBySocket.get(request);
      if (firstDocumentName === undefined) return void documentNameBySocket.set(request, documentName);
      if (firstDocumentName !== documentName) throw new CollaborationSingleDocumentError();
    },
    async onAuthenticate({ requestHeaders, requestParameters, request, token, documentName, connection }): Promise<CollaborationContext> {
      const documentId = requireDocumentId(documentName);
      const socketKind = socketKindOf(request);
      const { userId, role, impersonationEndsAt, bootstrapAttempt } = await admitters[socketKind]({ requestHeaders, token, documentId });
      if (role === DocumentRole.Reader) connection.readOnly = true;
      if (bootstrapAttempt === null) admitToCommittedRoom({ documentId, userId });
      return {
        userId,
        documentId,
        actor: ACTOR_BY_SOCKET_KIND[socketKind],
        bootstrapAttempt,
        tabId: tabIdOf(requestParameters),
        impersonationEndsAt,
      };
    },
    async connected({ context, connectionInstance, socketId }) {
      const { documentId, userId, bootstrapAttempt, impersonationEndsAt } = context as CollaborationContext;
      if (impersonationEndsAt !== null) {
        impersonationTimers.arm({
          socketId,
          endsAt: impersonationEndsAt,
          onEnd: () => connectionInstance.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON }),
        });
      }
      const isRevoked = documents.findRole({ documentId, userId }) === null;
      if (isRevoked) {
        console.warn(`${REVOKED_CLOSE_LOG} ${documentId}`);
        connectionInstance.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
        return;
      }
      const isStaleBootstrap = bootstrapAttempt !== null && !roomBootstrap.isCurrent({ documentId, attempt: bootstrapAttempt });
      if (!isStaleBootstrap) return;
      console.warn(`${STALE_BOOTSTRAP_CLOSE_LOG} ${documentId}`);
      connectionInstance.close({ code: UNAUTHORIZED_CLOSE_CODE, reason: UNAUTHORIZED_CLOSE_REASON });
    },
    async onLoadDocument({ document, documentName }) {
      const documentId = requireDocumentId(documentName);
      if (!bootstrap.isCommitted(documentId)) return;
      const restored = materialize({ log: updateLog, documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER });
      const restoredState = Y.encodeStateAsUpdate(restored);
      roomMemory.grew({ documentName, bytes: restoredState.byteLength });
      Y.applyUpdate(document, restoredState, LOADING_ORIGIN);
    },
    async afterLoadDocument({ document, documentName }) {
      awarenessOwners.seed({ documentName, bindings: updateLog.clientIdentities(requireDocumentId(documentName)) });
      trackAwarenessOwners({ document, owners: awarenessOwners });
    },
    async beforeHandleMessage({ update, context, document, socketId }) {
      const { userId } = context as CollaborationContext;
      const frame = Buffer.from(update.buffer, update.byteOffset, update.byteLength);
      const entries = awarenessEntriesOf(frame);
      if (entries === null) {
        console.warn(AWARENESS_MALFORMED_LOG);
        throw new MalformedAwarenessError();
      }
      if (!awarenessOwners.forbids({ documentName: document.name, userId, entries, meta: document.awareness.meta })) return;
      silenceAwarenessEntries(frame);
      if (dropLogCooldown.remainingMs(socketId) > 0) return;
      dropLogCooldown.start(socketId);
      console.warn(AWARENESS_DROP_LOG);
    },
    async onChange({ update, context, transactionOrigin, document }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const connectionContext = context as CollaborationContext;
      const { userId, documentId, actor, bootstrapAttempt } = connectionContext;
      if (!isWriteAllowed({ roomBootstrap, bootstrap, context: connectionContext, document }))
        return warnOncePerConnection({ context: connectionContext, warned: refusedConnections });
      roomMemory.grew({ documentName: document.name, bytes: update.byteLength });
      const isCommittingUpdate = bootstrapAttempt !== null && isBootstrapCommitted({ document }) && !bootstrap.isKnownCommitted(documentId);
      if (isCommittingUpdate) {
        bootstrap.commit({ documentId, connectionUserId: userId, connectionActor: actor, update, document });
        return onLogged(documentId);
      }
      updateLog.append({ documentName: documentId, connectionUserId: userId, connectionActor: actor, update });
      if (bootstrapAttempt !== null) roomBootstrap.received({ documentId, bytes: update.byteLength });
      onLogged(documentId);
    },
    async onDisconnect({ socketId }) {
      dropLogCooldown.forget(socketId);
      impersonationTimers.clear(socketId);
    },
    async onStoreDocument({ documentName }) {
      onStored(requireDocumentId(documentName));
    },
    async onAwarenessUpdate({ document }) {
      const overfull = overfullConnections(document);
      overfull.forEach(({ connection }) => {
        console.warn(AWARENESS_IDS_LOG);
        connection.close({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_IDS_REASON });
      });
      if (overfull.length > 0) return;
      declarer.declare(document);
    },
    async afterUnloadDocument({ instance, documentName }) {
      awarenessOwners.forget(documentName);
      declarer.forget(documentName);
      roomMemory.unloaded({ documentName, isReloaded: () => instance.documents.has(documentName) });
    },
  });
}
