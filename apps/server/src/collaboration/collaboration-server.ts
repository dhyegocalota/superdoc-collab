import { Hocuspocus } from '@hocuspocus/server';
import { materialize, type UpdateLog } from '@superdoc-history/history';
import { DocumentRole } from '@superdoc-history/types';
import * as Y from 'yjs';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';
import type { DocumentsRepository } from '../documents/documents-repository';
import { createClientDeclarer } from './client-declarations';
import { documentIdFromRoomName } from './room-name';

const COLLABORATION_SOCKET_TIMEOUT_MS = 10_000;
const STORE_DEBOUNCE_MS = 2000;
export const MAX_STORE_DEBOUNCE_MS = 4000;

export const LOADING_ORIGIN = 'update-log-replay';

export type CollaborationContext = { userId: string; documentId: string };

export class CollaborationAuthenticationError extends Error {
  constructor() {
    super('No valid session on the collaboration socket.');
  }
}

function requireDocumentId(roomName: string): string {
  const documentId = documentIdFromRoomName(roomName);
  if (!documentId) throw new CollaborationAuthenticationError();
  return documentId;
}

export function createCollaborationServer({ auth, documents, log, onLogged, onStored }: { auth: Auth; documents: DocumentsRepository; log: UpdateLog; onLogged: (documentId: string) => void; onStored: (documentId: string) => void }): Hocuspocus {
  const declarer = createClientDeclarer(log);
  return new Hocuspocus({
    quiet: true,
    timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: MAX_STORE_DEBOUNCE_MS,
    async onAuthenticate({ requestHeaders, documentName, connection }): Promise<CollaborationContext> {
      const cookie = requestHeaders.cookie;
      if (!cookie) throw new CollaborationAuthenticationError();
      const user = await readSession({ auth, headers: new Headers({ cookie }) });
      if (!user) throw new CollaborationAuthenticationError();
      const documentId = requireDocumentId(documentName);
      const role = documents.findRole({ documentId, userId: user.id });
      if (!role) throw new CollaborationAuthenticationError();
      if (role === DocumentRole.Reader) connection.readOnly = true;
      return { userId: user.id, documentId };
    },
    async onLoadDocument({ document, documentName }) {
      const restored = materialize({ log, documentName: requireDocumentId(documentName), untilSequence: Number.MAX_SAFE_INTEGER });
      Y.applyUpdate(document, Y.encodeStateAsUpdate(restored), LOADING_ORIGIN);
    },
    async onChange({ update, context, transactionOrigin }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const { userId, documentId } = context as CollaborationContext;
      log.append({ documentName: documentId, connectionUserId: userId, update });
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
