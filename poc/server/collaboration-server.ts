import { Hocuspocus, type Document } from '@hocuspocus/server';
import * as Y from 'yjs';
import { UpdateLog, compact, materialize } from '../lib/update-log';

type ConnectionContext = { userId: string };

export type CollaborationServerOptions = {
  port: number;
  databasePath: string;
};

export type RunningCollaborationServer = {
  server: Hocuspocus;
  log: UpdateLog;
  stop: () => Promise<void>;
};

const LOADING_ORIGIN = 'update-log-replay';
const SNAPSHOT_EVERY_UPDATES = 1000;

type AwarenessState = { userId?: string };

function declareConnectedClients({ document, log }: { document: Document; log: UpdateLog }): void {
  const states = document.awareness.getStates() as Map<number, AwarenessState>;
  [...document.connections.values()].forEach(({ clients, connection }) => {
    const { userId } = connection.context as ConnectionContext;
    [...clients]
      .filter((clientId: number) => states.get(clientId)?.userId === userId)
      .forEach((clientId: number) => log.declareClientIdentity({ documentName: document.name, yjsClientId: clientId, userId }));
  });
}

export async function startCollaborationServer({ port, databasePath }: CollaborationServerOptions): Promise<RunningCollaborationServer> {
  const log = new UpdateLog(databasePath);
  const server = new Hocuspocus({
    port,
    address: '127.0.0.1',
    quiet: true,
    debounce: 200,
    async onAuthenticate({ token }): Promise<ConnectionContext> {
      if (!token) throw new Error('Missing token.');
      return { userId: token };
    },
    async onLoadDocument({ document, documentName }) {
      const restored = materialize({ log, documentName, untilSequence: Number.MAX_SAFE_INTEGER });
      Y.applyUpdate(document, Y.encodeStateAsUpdate(restored), LOADING_ORIGIN);
    },
    async onStoreDocument({ documentName }) {
      compact({ log, documentName, everyUpdates: SNAPSHOT_EVERY_UPDATES });
    },
    async onChange({ documentName, update, context, transactionOrigin }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const { userId } = context as ConnectionContext;
      log.append({ documentName, connectionUserId: userId, update });
    },
    async onAwarenessUpdate({ document }) {
      declareConnectedClients({ document, log });
    },
  });
  await server.listen();
  return {
    server,
    log,
    stop: async () => {
      await server.destroy();
      log.close();
    },
  };
}
