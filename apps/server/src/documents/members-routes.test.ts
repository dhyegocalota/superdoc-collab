import { ApiPath, DocumentResource, DocumentRole, TAB_QUERY_KEY, type DocumentMembers } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { commitBootstrap as commitRoom } from '../testing/committed-room';
import { pathOf, request } from '../testing/documents-client';

test('members answers isCurrentUserOnline for the tab that asks, not for another tab of the same user', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const connectedTab = randomUUID();
  const otherTab = randomUUID();
  const client = await connectToDocument({
    server,
    cookie: owner.cookie,
    documentId,
    bootstrapToken: null,
    path: `${ApiPath.Collaboration}?${TAB_QUERY_KEY}=${connectedTab}`,
  });
  const path = pathOf({ documentId, resource: DocumentResource.Members });
  async function answerFor(query: string): Promise<boolean | undefined> {
    const answer: DocumentMembers = await (await request({ server, cookie: owner.cookie, path: `${path}${query}` })).json();
    return answer.isCurrentUserOnline;
  }
  expect(await answerFor(`?${TAB_QUERY_KEY}=${connectedTab}`)).toBe(true);
  expect(await answerFor(`?${TAB_QUERY_KEY}=${otherTab}`)).toBe(false);
  expect(await answerFor('')).toBe(true);
  client.close();
  await server.stop();
});

test('a socket of another user carrying a tab id does not make that tab online for the asking user', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const readerTab = randomUUID();
  const client = await connectToDocument({
    server,
    cookie: reader.cookie,
    documentId,
    path: `${ApiPath.Collaboration}?${TAB_QUERY_KEY}=${readerTab}`,
  });
  const path = `${pathOf({ documentId, resource: DocumentResource.Members })}?${TAB_QUERY_KEY}=${readerTab}`;
  const ownerAnswer: DocumentMembers = await (await request({ server, cookie: owner.cookie, path })).json();
  const readerAnswer: DocumentMembers = await (await request({ server, cookie: reader.cookie, path })).json();
  expect([ownerAnswer.isCurrentUserOnline, readerAnswer.isCurrentUserOnline]).toEqual([false, true]);
  client.close();
  await server.stop();
});

test.each([
  { name: 'empty', tab: '' },
  { name: 'not a UUID', tab: 'a'.repeat(1024) },
])('members treats a $name tab as absent and answers per user', async ({ tab }) => {
  const { server, documentId, owner } = await documentWithOwner();
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const path = `${pathOf({ documentId, resource: DocumentResource.Members })}?${TAB_QUERY_KEY}=${tab}`;
  const answer: DocumentMembers = await (await request({ server, cookie: owner.cookie, path })).json();
  expect(answer.isCurrentUserOnline).toBe(true);
  client.close();
  await server.stop();
});

test('members answers who is online and carries no attempt flags', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const answer: DocumentMembers = await (
    await request({ server, cookie: owner.cookie, path: pathOf({ documentId, resource: DocumentResource.Members }) })
  ).json();
  expect(Object.keys(answer).sort()).toEqual(['isCurrentUserOnline', 'members']);
  await server.stop();
});
