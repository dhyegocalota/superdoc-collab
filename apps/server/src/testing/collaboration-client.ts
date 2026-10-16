import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { ApiPath, COLLABORATION_TOKEN_PLACEHOLDER, type DocumentRole } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { SUPERDOC_ROOM_PREFIX } from '../collaboration/room-name';
import { signedInOwner, signedInUser, type TestServer, type TestUser } from './test-server';

const DOCUMENT_TITLE = 'Shared plan';
const MEMBER_NAME = 'Member';

export type CollaborationClient = { document: Y.Doc; provider: HocuspocusProvider; close: () => void };

export class CollaborationRefusedError extends Error {
  constructor() {
    super('The collaboration server refused the connection.');
  }
}

function socketWithCookie({ cookie, origin }: { cookie: string; origin: string }): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie }, origin });
      this.on('error', () => undefined);
    }
  } as unknown as typeof WebSocket;
}

export function connectToDocument({ server, cookie, documentId, document = new Y.Doc(), origin = server.baseUrl }: { server: TestServer; cookie: string; documentId: string; document?: Y.Doc; origin?: string }): Promise<CollaborationClient> {
  return new Promise((resolve, reject) => {
    let isSynced = false;
    const websocketProvider = new HocuspocusProviderWebsocket({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, WebSocketPolyfill: socketWithCookie({ cookie, origin }), maxAttempts: 1, connect: false });
    const provider = new HocuspocusProvider({
      websocketProvider,
      document,
      name: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      token: COLLABORATION_TOKEN_PLACEHOLDER,
      onSynced: () => {
        isSynced = true;
        resolve({ document, provider, close });
      },
      onAuthenticationFailed: () => {
        close();
        reject(new CollaborationRefusedError());
      },
      onClose: () => {
        if (isSynced) return;
        close();
        reject(new CollaborationRefusedError());
      },
    });
    websocketProvider.connect().catch(() => undefined);
    function close(): void {
      provider.destroy();
      websocketProvider.destroy();
    }
  });
}

export async function documentWithOwner(): Promise<{ server: TestServer; documentId: string; owner: TestUser }> {
  const { server, owner } = await signedInOwner();
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: DOCUMENT_TITLE, ownerUserId: owner.id });
  return { server, documentId, owner };
}

export async function memberWithRole({ server, documentId, role }: { server: TestServer; documentId: string; role: DocumentRole }): Promise<TestUser> {
  const member = await signedInUser({ server, name: MEMBER_NAME });
  server.services.documents.grant({ documentId, userId: member.id, role });
  return member;
}
