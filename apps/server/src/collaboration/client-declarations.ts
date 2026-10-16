import type { Document } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-history/history';
import type { CollaborationContext } from './collaboration-server';

type PresenceState = { userId?: string };

export function createClientDeclarer(log: UpdateLog) {
  const lastDeclared = new Map<string, string>();
  return {
    declare(document: Document): void {
      const states = document.awareness.getStates() as Map<number, PresenceState>;
      const declarations = [...document.connections.values()].flatMap(({ clients, connection }) => {
        const { userId, documentId } = connection.context as CollaborationContext;
        return [...clients].filter((clientId: number) => states.get(clientId)?.userId === userId).map((clientId: number) => ({ documentName: documentId, yjsClientId: clientId, userId }));
      });
      const signature = JSON.stringify(declarations.map(({ yjsClientId, userId }) => `${yjsClientId}:${userId}`).sort());
      if (lastDeclared.get(document.name) === signature) return;
      lastDeclared.set(document.name, signature);
      declarations.forEach((declaration) => log.declareClientIdentity(declaration));
    },
    forget(documentName: string): void {
      lastDeclared.delete(documentName);
    },
  };
}
