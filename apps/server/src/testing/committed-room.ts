import { commitBootstrap as markBootstrapCommitted } from '@superdoc-collab/history/testing';
import { ClientActor } from '@superdoc-collab/types';
import * as Y from 'yjs';
import type { ServerServices } from '../server';

export function commitBootstrap({ services, documentId, userId }: { services: ServerServices; documentId: string; userId: string }): void {
  const document = new Y.Doc();
  markBootstrapCommitted(document);
  const state = Y.encodeStateAsUpdate(document);
  services.updateLog.appendCommitted({
    documentName: documentId,
    connectionUserId: userId,
    connectionActor: ClientActor.Human,
    update: state,
    state,
  });
}
