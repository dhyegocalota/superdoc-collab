import { Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';

type ConnectionContext = { userId: string };

const LOADING_ORIGIN = 'spike-replay';

export type LoggedUpdate = { userId: string; bytes: number };

export type RunningCollaborationServer = {
  server: Hocuspocus;
  url: string;
  updates: LoggedUpdate[];
  awarenessUsers: Map<string, unknown>;
  authenticatedTokens: string[];
  roomDocument: (documentName: string) => Y.Doc;
  stop: () => Promise<void>;
};

export async function startCollaborationServer(port: number): Promise<RunningCollaborationServer> {
  const updates: LoggedUpdate[] = [];
  const authenticatedTokens: string[] = [];
  const awarenessUsers = new Map<string, unknown>();
  const storedStates = new Map<string, Uint8Array>();
  const server = new Hocuspocus({
    port,
    address: '127.0.0.1',
    quiet: true,
    debounce: 50,
    async onConnect({ documentName }) {
      console.log('server: connection to', documentName);
    },
    async onAuthenticate({ token }): Promise<ConnectionContext> {
      if (!token) throw new Error('Missing token.');
      authenticatedTokens.push(token);
      return { userId: token };
    },
    async onLoadDocument({ document, documentName }) {
      const stored = storedStates.get(documentName);
      if (!stored) return;
      Y.applyUpdate(document, stored, LOADING_ORIGIN);
    },
    async onStoreDocument({ document, documentName }) {
      storedStates.set(documentName, Y.encodeStateAsUpdate(document));
    },
    async onChange({ update, context, transactionOrigin }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const { userId } = context as ConnectionContext;
      updates.push({ userId, bytes: update.byteLength });
    },
    async onAwarenessUpdate({ document }) {
      [...document.awareness.getStates().entries()].forEach(([clientId, state]) => awarenessUsers.set(String(clientId), state));
    },
  });
  await server.listen();
  return {
    server,
    url: `ws://127.0.0.1:${port}`,
    updates,
    awarenessUsers,
    authenticatedTokens,
    roomDocument: (documentName) => {
      const document = [...server.documents.values()].find((candidate) => candidate.name.endsWith(`/${documentName}`) || candidate.name === documentName);
      if (!document) throw new Error(`Room ${documentName} is not loaded.`);
      return document;
    },
    stop: () => server.destroy(),
  };
}
