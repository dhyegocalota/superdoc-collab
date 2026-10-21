import { HttpStatus, publicMembersApiPath, type PublicMembers, type PublicOpened, PublicAccess } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { connectAsVisitor, connectToDocument } from '../testing/collaboration-client';
import { publicRoom, visitorToken } from '../testing/public-room';
import type { TestServer } from '../testing/test-server';

async function membersOf({ server, documentId }: { server: TestServer; documentId: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${publicMembersApiPath(documentId)}`);
}

test('the public members are the online people by name and colour and the visitors, with no id and no email', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const opened: PublicOpened = await (await fetch(`${server.baseUrl}/api/public/${documentId}`)).json();
  if (opened.access !== PublicAccess.Visitor) throw new Error('A visitor was expected');
  const visitor = await connectAsVisitor({ server, token: opened.roomToken, documentId });
  const response = await membersOf({ server, documentId });
  const text = await response.text();
  const body: PublicMembers = JSON.parse(text);
  expect(response.status).toBe(HttpStatus.Ok);
  expect(body.members).toEqual([{ name: 'Ana', colorSlot: expect.any(Number) }]);
  expect(body.visitors).toEqual([opened.viewer]);
  expect([text.includes('@'), text.includes(owner.id), text.includes(owner.email)]).toEqual([false, false, false]);
  [ownerClient, visitor].forEach((client) => client.close());
  await server.stop();
});

test('a member who is offline and a visitor who left are not listed', async () => {
  const { server, documentId } = await publicRoom();
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  visitor.close();
  await expect.poll(async () => ((await (await membersOf({ server, documentId })).json()) as PublicMembers).visitors).toEqual([]);
  const body: PublicMembers = await (await membersOf({ server, documentId })).json();
  expect(body.members).toEqual([]);
  await server.stop();
});

test('the public members of a private or missing document are not found', async () => {
  const { server, documentId } = await publicRoom();
  server.services.documents.setPublic({ documentId, isPublic: false });
  const answers = await Promise.all([documentId, randomUUID()].map((id) => membersOf({ server, documentId: id })));
  expect(answers.map((answer) => answer.status)).toEqual([HttpStatus.NotFound, HttpStatus.NotFound]);
  await server.stop();
});
