import { commitBootstrap as markBootstrapCommitted } from '@superdoc-collab/history/testing';
import { ClientActor, RoomMode } from '@superdoc-collab/types';
import { expect } from 'vitest';
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

export async function waitForCommit({ services, documentId }: { services: ServerServices; documentId: string }): Promise<void> {
  await expect.poll(() => services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
}
