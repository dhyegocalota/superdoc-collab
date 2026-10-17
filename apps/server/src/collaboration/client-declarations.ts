import type { Document } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-history/history';
import type { CollaborationContext } from './collaboration-server';

type PresenceState = { userId?: string };

export function createClientDeclarer(log: UpdateLog) {
  const lastDeclared = new Map<string, string>();
  return {
    declare(document: Document): void {
      const states = document.awareness.getStates() as Map<number, PresenceState>;
      const writable = [...document.connections.values()].filter(({ connection }) => !connection.readOnly);
      const holders = [...document.connections.values()].flatMap(({ clients }) => [...clients] as number[]);
      const declarations = writable.flatMap(({ clients, connection }) => {
        const { userId, documentId } = connection.context as CollaborationContext;
        const isContested = (clientId: number) => holders.filter((holder) => holder === clientId).length > 1;
        return [...clients]
          .filter((clientId: number) => states.get(clientId)?.userId === userId && !isContested(clientId))
          .map((clientId: number) => ({ documentName: documentId, yjsClientId: clientId, userId }));
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
