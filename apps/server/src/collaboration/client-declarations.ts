import type { Document } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-collab/history';
import { ClientActor } from '@superdoc-collab/types';
import type { CollaborationContext } from './collaboration-server';

type PresenceState = { userId?: string };

export function createClientDeclarer(updateLog: UpdateLog) {
  const lastDeclared = new Map<string, string>();
  return {
    declare(document: Document): void {
      const states = document.awareness.getStates() as Map<number, PresenceState>;
      const writable = [...document.connections.values()].filter(({ connection }) => {
        const { actor } = connection.context as CollaborationContext;
        return !connection.readOnly && actor === ClientActor.Human;
      });
      const seen = new Set<number>();
      const contested = new Set<number>();
      [...document.connections.values()].forEach(({ clients }) =>
        clients.forEach((clientId: number) => (seen.has(clientId) ? contested : seen).add(clientId)),
      );
      const declarations = writable.flatMap(({ clients, connection }) => {
        const { userId, documentId, actor } = connection.context as CollaborationContext;
        return [...clients]
          .filter((clientId: number) => states.get(clientId)?.userId === userId && !contested.has(clientId))
          .map((clientId: number) => ({ documentName: documentId, yjsClientId: clientId, userId, actor }));
      });
      const signature = JSON.stringify(declarations.map(({ yjsClientId, userId }) => `${yjsClientId}:${userId}`).sort());
      if (lastDeclared.get(document.name) === signature) return;
      lastDeclared.set(document.name, signature);
      declarations.forEach((declaration) => updateLog.declareClientIdentity(declaration));
    },
    forget(documentName: string): void {
      lastDeclared.delete(documentName);
    },
  };
}
