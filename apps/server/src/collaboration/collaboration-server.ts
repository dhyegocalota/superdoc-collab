import { Hocuspocus } from '@hocuspocus/server';
import { materialize, type UpdateLog } from '@superdoc-history/history';
import { ClientActor, DocumentRole, SECOND_MS } from '@superdoc-history/types';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import { authenticateMember, CollaborationAuthenticationError } from './authenticate-member';
import { createClientDeclarer } from './client-declarations';
import { documentIdFromRoomName } from './room-name';

export const COLLABORATION_SOCKET_TIMEOUT_MS = 10 * SECOND_MS;
const STORE_DEBOUNCE_MS = 2 * SECOND_MS;
export const MAX_STORE_DEBOUNCE_MS = 4 * SECOND_MS;

export const LOADING_ORIGIN = 'update-log-replay';

export type CollaborationContext = { userId: string; documentId: string };

function requireDocumentId(roomName: string): string {
  const documentId = documentIdFromRoomName(roomName);
  if (!documentId) throw new CollaborationAuthenticationError();
  return documentId;
}

export function createCollaborationServer({
  auth,
  documents,
  updateLog,
  onLogged,
  onStored,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  updateLog: UpdateLog;
  onLogged: (documentId: string) => void;
  onStored: (documentId: string) => void;
}): Hocuspocus {
  const declarer = createClientDeclarer(updateLog);
  return new Hocuspocus({
    quiet: true,
    timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: MAX_STORE_DEBOUNCE_MS,
    async onAuthenticate({ requestHeaders, documentName, connection }): Promise<CollaborationContext> {
      const documentId = requireDocumentId(documentName);
      const { userId, role } = await authenticateMember({ auth, documents, cookie: requestHeaders.cookie, documentId });
      if (role === DocumentRole.Reader) connection.readOnly = true;
      return { userId, documentId };
    },
    async onLoadDocument({ document, documentName }) {
      const restored = materialize({
        log: updateLog,
        documentName: requireDocumentId(documentName),
        untilSequence: Number.MAX_SAFE_INTEGER,
      });
      Y.applyUpdate(document, Y.encodeStateAsUpdate(restored), LOADING_ORIGIN);
    },
    async onChange({ update, context, transactionOrigin }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const { userId, documentId } = context as CollaborationContext;
      updateLog.append({ documentName: documentId, connectionUserId: userId, connectionActor: ClientActor.Human, update });
      onLogged(documentId);
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
