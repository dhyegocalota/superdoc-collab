import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage } from 'node:http';
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
  SUPERSEDED_ATTEMPT_CLOSE_CODE,
  SUPERSEDED_ATTEMPT_REASON,
} from '@superdoc-collab/types';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import { KeyedCooldown } from '../limits/keyed-cooldown';
import type { RoomModes } from './room-modes';
import type { BootstrapState } from './bootstrap-state';
import { authenticateAgent } from './authenticate-agent';
import { authenticateMember, CollaborationAuthenticationError } from './authenticate-member';
import { overfullConnections } from './awareness-client-cap';
import { trackAwarenessOwners } from './awareness-origin';
import { AwarenessOwners } from './awareness-owners';
import { awarenessEntriesOf, silenceAwarenessEntries } from './frame-bucket';
import { createClientDeclarer } from './client-declarations';
import type { CollaborationContext } from './collaboration-context';
import type { CreatorReservations } from './creator-reservations';
import { claimedTicketOf, type ClaimedTicket } from './claimed-ticket';
import { documentIdFromRoomName } from './room-name';
import { isAgentUpgrade } from './upgrade-path';

export type { CollaborationContext };

export const COLLABORATION_SOCKET_TIMEOUT_MS = 10 * SECOND_MS;
const STORE_DEBOUNCE_MS = 2 * SECOND_MS;
export const MAX_STORE_DEBOUNCE_MS = 4 * SECOND_MS;

export const LOADING_ORIGIN = 'update-log-replay';

const PARSE_BASE_URL = 'http://localhost';
const NO_TICKET: ClaimedTicket = { attempt: null, epoch: null };
export const OPEN_BUDGET_LOG = 'Refused a socket on an uncommitted room: the open budget of the user is spent';
const DROP_LOG_COOLDOWN_MS = MINUTE_MS;
export const AWARENESS_MALFORMED_LOG = 'Collaboration socket closed for sending an awareness frame with an unreadable entry';
export const AWARENESS_DROP_LOG = 'Dropped an awareness frame that touches an awareness client another user announced';
export const AWARENESS_IDS_LOG = 'Collaboration socket closed for holding too many awareness clients';
const REFUSED_UPDATE_LOG = 'Dropped an update from a superseded creator attempt';
const SUPERSEDED_CLOSE_LOG = 'Closed a socket whose creator attempt is not the committing one';
export const UNTICKETED_REFUSAL_LOG = 'Refused a socket without a creator ticket on an uncommitted room';
export const REFUSED_TICKET_LOG = 'Refused a socket whose creator ticket is not the latest on an uncommitted room';

export class MalformedAwarenessError extends Error {
  readonly code = POLICY_VIOLATION_CLOSE_CODE;
  readonly reason = SOCKET_AWARENESS_ENTRIES_REASON;

  constructor() {
    super(SOCKET_AWARENESS_ENTRIES_REASON);
  }
}

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

function claimedTicketFrom(request: IncomingMessage): ClaimedTicket {
  if (!request.url) throw new CollaborationAuthenticationError();
  return claimedTicketOf(new URL(request.url, PARSE_BASE_URL).searchParams);
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
  roomModes,
  onLogged,
  onStored,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  updateLog: UpdateLog;
  reservations: CreatorReservations;
  bootstrap: BootstrapState;
  roomModes: RoomModes;
  onLogged: (documentId: string) => void;
  onStored: (documentId: string) => void;
}): Hocuspocus {
  const declarer = createClientDeclarer(updateLog);
  const awarenessOwners = new AwarenessOwners();
  const dropLogCooldown = new KeyedCooldown({ durationMs: DROP_LOG_COOLDOWN_MS });
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
    async onAuthenticate({ requestHeaders, requestParameters, request, token, documentName, connection }): Promise<CollaborationContext> {
      const documentId = requireDocumentId(documentName);
      const actor = connectionActorOf(request);
      const { userId, role } =
        actor === ClientActor.Agent
          ? await authenticateAgent({ auth, documents, token, documentId })
          : await authenticateMember({ auth, documents, cookie: requestHeaders.cookie, documentId });
      if (role === DocumentRole.Reader) connection.readOnly = true;
      const claimedTicket = claimedTicketFrom(request);
      const answer = roomModes.resolve({ documentId, userId });
      if (answer.isSpent) {
        console.warn(`${OPEN_BUDGET_LOG} ${documentId}`);
        throw new CollaborationAuthenticationError();
      }
      const isCommitted = answer.roomMode === RoomMode.Join;
      const isFromAnotherEpoch = claimedTicket.epoch !== reservations.epoch;
      const { attempt, epoch } = isCommitted && isFromAnotherEpoch ? NO_TICKET : claimedTicket;
      const isHolder = attempt !== null && reservations.attemptOf({ documentId, userId }) === attempt;
      const mayWrite = reservations.mayWrite({ documentId, attempt, epoch, isCommitted });
      const isTicketless = actor === ClientActor.Agent || attempt === null;
      if (!isCommitted && isTicketless) {
        console.warn(`${UNTICKETED_REFUSAL_LOG} ${documentId}`);
        throw new CollaborationAuthenticationError();
      }
      const isAdmittedCreator = isHolder && mayWrite;
      if (!isCommitted && !isAdmittedCreator) {
        console.warn(`${REFUSED_TICKET_LOG} ${documentId}`);
        throw new CollaborationSupersededError();
      }
      if (!mayWrite) connection.readOnly = true;
      return { userId, documentId, actor, creatorAttempt: attempt, creatorEpoch: epoch, tabId: tabIdOf(requestParameters) };
    },
    async connected({ context, connectionInstance }) {
      const { documentId, creatorAttempt, creatorEpoch } = context as CollaborationContext;
      const isAdmitted = reservations.mayWrite({ documentId, attempt: creatorAttempt, epoch: creatorEpoch, isCommitted: true });
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
      const { userId, documentId, actor, creatorAttempt } = connectionContext;
      if (!isWriteAllowed({ reservations, bootstrap, context: connectionContext, document }))
        return warnOncePerConnection({ context: connectionContext, warned: refusedConnections });
      const isCommittingUpdate = creatorAttempt !== null && isBootstrapCommitted({ document }) && !bootstrap.isCommitted(documentId);
      if (isCommittingUpdate) {
        bootstrap.commit({ documentId, connectionUserId: userId, connectionActor: actor, update, document });
        reservations.commit(documentId);
        return onLogged(documentId);
      }
      updateLog.append({ documentName: documentId, connectionUserId: userId, connectionActor: actor, update });
      if (creatorAttempt !== null) reservations.touch({ documentId, attempt: creatorAttempt });
      onLogged(documentId);
    },
    async onDisconnect({ context, socketId }) {
      dropLogCooldown.forget(socketId);
      const { documentId, creatorAttempt } = context as CollaborationContext;
      if (creatorAttempt === null) return;
      reservations.release({ documentId, attempt: creatorAttempt });
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
    async afterUnloadDocument({ documentName }) {
      awarenessOwners.forget(documentName);
      declarer.forget(documentName);
    },
  });
}
