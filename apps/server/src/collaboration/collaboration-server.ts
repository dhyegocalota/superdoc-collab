import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage } from 'node:http';
import { isBootstrapCommitted, materialize, type UpdateLog } from '@superdoc-collab/history';
import {
  ClientActor,
  CREATOR_ATTEMPT_QUERY_KEY,
  CREATOR_EPOCH_QUERY_KEY,
  DocumentRole,
  POLICY_VIOLATION_CLOSE_CODE,
  SECOND_MS,
  SOCKET_SINGLE_DOCUMENT_REASON,
  SUPERSEDED_ATTEMPT_CLOSE_CODE,
  SUPERSEDED_ATTEMPT_REASON,
} from '@superdoc-collab/types';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import type { BootstrapState } from './bootstrap-state';
import { authenticateAgent } from './authenticate-agent';
import { authenticateMember, CollaborationAuthenticationError } from './authenticate-member';
import { createClientDeclarer } from './client-declarations';
import type { CollaborationContext } from './collaboration-context';
import type { CreatorReservations } from './creator-reservations';
import { documentIdFromRoomName } from './room-name';
import { isAgentUpgrade } from './upgrade-path';

export type { CollaborationContext };

export const COLLABORATION_SOCKET_TIMEOUT_MS = 10 * SECOND_MS;
const STORE_DEBOUNCE_MS = 2 * SECOND_MS;
export const MAX_STORE_DEBOUNCE_MS = 4 * SECOND_MS;

export const LOADING_ORIGIN = 'update-log-replay';

const PARSE_BASE_URL = 'http://localhost';
const FIRST_ATTEMPT = 1;
const REFUSED_UPDATE_LOG = 'Dropped an update from a superseded creator attempt';
const SUPERSEDED_CLOSE_LOG = 'Closed a socket whose creator attempt is not the committing one';
const UNCOMMITTED_REFUSAL_LOG = 'Refused a socket on an uncommitted room without the creator attempt';

export class CollaborationSupersededError extends Error {
  readonly code = SUPERSEDED_ATTEMPT_CLOSE_CODE;
  readonly reason = SUPERSEDED_ATTEMPT_REASON;

  constructor() {
    super(SUPERSEDED_ATTEMPT_REASON);
  }
}

export class CollaborationSingleDocumentError extends Error {
  readonly code = POLICY_VIOLATION_CLOSE_CODE;
  readonly reason = SOCKET_SINGLE_DOCUMENT_REASON;

  constructor() {
    super(SOCKET_SINGLE_DOCUMENT_REASON);
  }
}

function isWriteAllowed({
  reservations,
  bootstrap,
  context,
  document,
}: {
  reservations: CreatorReservations;
  bootstrap: BootstrapState;
  context: CollaborationContext;
  document: Y.Doc;
}): boolean {
  const { documentId, creatorAttempt, creatorEpoch } = context;
  if (creatorAttempt === null) return isBootstrapCommitted({ document }) || bootstrap.isCommitted(documentId);
  return reservations.mayWrite({ documentId, attempt: creatorAttempt, epoch: creatorEpoch, isCommitted: false });
}

function warnOncePerConnection({ context, warned }: { context: CollaborationContext; warned: WeakSet<CollaborationContext> }): void {
  if (warned.has(context)) return;
  warned.add(context);
  console.warn(`${REFUSED_UPDATE_LOG} ${context.documentId}`);
}

function claimedTicketOf(request: IncomingMessage): { attempt: number | null; epoch: string | null } {
  if (!request.url) throw new CollaborationAuthenticationError();
  const { searchParams } = new URL(request.url, PARSE_BASE_URL);
  const attempt = Number(searchParams.get(CREATOR_ATTEMPT_QUERY_KEY));
  const epoch = searchParams.get(CREATOR_EPOCH_QUERY_KEY);
  return {
    attempt: Number.isInteger(attempt) && attempt >= FIRST_ATTEMPT ? attempt : null,
    epoch: epoch ? epoch : null,
  };
}

function requireDocumentId(roomName: string): string {
  const documentId = documentIdFromRoomName(roomName);
  if (!documentId) throw new CollaborationAuthenticationError();
  return documentId;
}

function connectionActorOf(request: IncomingMessage): ClientActor {
  if (!request.url) throw new CollaborationAuthenticationError();
  return isAgentUpgrade(request.url) ? ClientActor.Agent : ClientActor.Human;
}

export function createCollaborationServer({
  auth,
  documents,
  updateLog,
  reservations,
  bootstrap,
  onLogged,
  onStored,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  updateLog: UpdateLog;
  reservations: CreatorReservations;
  bootstrap: BootstrapState;
  onLogged: (documentId: string) => void;
  onStored: (documentId: string) => void;
}): Hocuspocus {
  const declarer = createClientDeclarer(updateLog);
  const refusedConnections = new WeakSet<CollaborationContext>();
  const documentNameBySocket = new WeakMap<IncomingMessage, string>();
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
    async onAuthenticate({ requestHeaders, request, token, documentName, connection }): Promise<CollaborationContext> {
      const documentId = requireDocumentId(documentName);
      const actor = connectionActorOf(request);
      const { userId, role } =
        actor === ClientActor.Agent
          ? await authenticateAgent({ auth, documents, token, documentId })
          : await authenticateMember({ auth, documents, cookie: requestHeaders.cookie, documentId });
      if (role === DocumentRole.Reader) connection.readOnly = true;
      const { attempt, epoch } = claimedTicketOf(request);
      const isCommitted = bootstrap.isCommitted(documentId);
      const isHolder = attempt !== null && reservations.attemptOf({ documentId, userId }) === attempt;
      const mayWrite = reservations.mayWrite({ documentId, attempt, epoch, isCommitted });
      if (!isCommitted && actor === ClientActor.Agent) {
        console.warn(`${UNCOMMITTED_REFUSAL_LOG} ${documentId}`);
        throw new CollaborationAuthenticationError();
      }
      if (!isCommitted && attempt === null) {
        console.warn(`${UNCOMMITTED_REFUSAL_LOG} ${documentId}`);
        throw new CollaborationAuthenticationError();
      }
      const isAdmittedCreator = isHolder && mayWrite;
      if (!isCommitted && !isAdmittedCreator) {
        console.warn(`${UNCOMMITTED_REFUSAL_LOG} ${documentId}`);
        throw new CollaborationSupersededError();
      }
      if (!mayWrite) connection.readOnly = true;
      return { userId, documentId, actor, creatorAttempt: attempt, creatorEpoch: epoch };
    },
    async connected({ context, connectionInstance }) {
      const { documentId, creatorAttempt, creatorEpoch } = context as CollaborationContext;
      const isAdmitted = reservations.mayWrite({ documentId, attempt: creatorAttempt, epoch: creatorEpoch, isCommitted: true });
      if (isAdmitted && creatorAttempt !== null) return reservations.touch({ documentId, attempt: creatorAttempt });
      if (isAdmitted) return;
      console.warn(`${SUPERSEDED_CLOSE_LOG} ${documentId}`);
      connectionInstance.close({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON });
    },
    async onLoadDocument({ document, documentName }) {
      const documentId = requireDocumentId(documentName);
      if (!bootstrap.isCommitted(documentId)) return;
      const restored = materialize({ log: updateLog, documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER });
      Y.applyUpdate(document, Y.encodeStateAsUpdate(restored), LOADING_ORIGIN);
    },
    async onChange({ update, context, transactionOrigin, document }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const connectionContext = context as CollaborationContext;
      const { userId, documentId, actor, creatorAttempt } = connectionContext;
      if (!isWriteAllowed({ reservations, bootstrap, context: connectionContext, document }))
        return warnOncePerConnection({ context: connectionContext, warned: refusedConnections });
      const isCommittingUpdate = creatorAttempt !== null && isBootstrapCommitted({ document }) && !bootstrap.isCommitted(documentId);
      if (isCommittingUpdate) {
        bootstrap.commit({ documentId, connectionUserId: userId, connectionActor: actor, update, document });
        reservations.commit({ documentId, attempt: creatorAttempt });
        return onLogged(documentId);
      }
      updateLog.append({ documentName: documentId, connectionUserId: userId, connectionActor: actor, update });
      if (creatorAttempt !== null) reservations.touch({ documentId, attempt: creatorAttempt });
      onLogged(documentId);
    },
    async onDisconnect({ context, document }) {
      const { documentId, creatorAttempt } = context as CollaborationContext;
      if (creatorAttempt === null) return;
      const isAttemptStillConnected = [...document.connections.values()].some(
        ({ connection }) => (connection.context as CollaborationContext).creatorAttempt === creatorAttempt,
      );
      if (isAttemptStillConnected) return;
      reservations.release({ documentId, attempt: creatorAttempt });
    },
    async onStoreDocument({ documentName }) {
      onStored(requireDocumentId(documentName));
    },
    async onAwarenessUpdate({ document }) {
      declarer.declare(document);
    },
    async afterUnloadDocument({ documentName }) {
      declarer.forget(documentName);
    },
  });
}
