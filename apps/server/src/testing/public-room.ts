import { PublicAccess, publicApiPath, type PublicOpened } from '@superdoc-collab/types';
import { SUPERDOC_ROOM_PREFIX } from '../collaboration/room-name';
import { documentWithOwner } from './collaboration-client';
import { commitBootstrap } from './committed-room';
import type { TestServer } from './test-server';

export async function publicRoom() {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  server.services.documents.setPublic({ documentId, isPublic: true });
  return { server, documentId, owner };
}

export async function visitorToken({ server, documentId }: { server: TestServer; documentId: string }): Promise<string> {
  const opened: PublicOpened = await (await fetch(`${server.baseUrl}${publicApiPath(documentId)}`)).json();
  if (opened.access !== PublicAccess.Visitor) throw new Error('A visitor was expected');
  return opened.roomToken;
}

export function roomConnections({ server, documentId }: { server: TestServer; documentId: string }) {
  const room = server.services.hocuspocus.documents.get(`${SUPERDOC_ROOM_PREFIX}${documentId}`);
  if (!room) throw new Error('The room is not loaded.');
  return [...room.connections.values()].map(({ connection }) => connection);
}
