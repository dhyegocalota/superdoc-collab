import {
  ApiPath,
  CREATOR_ATTEMPT_QUERY_KEY,
  CREATOR_EPOCH_QUERY_KEY,
  DocumentResource,
  DocumentRole,
  TAB_QUERY_KEY,
  type CreatorTicket,
  type DocumentMembers,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { commitBootstrap as commitRoom } from '../testing/committed-room';
import { openedBy, pathOf, request } from '../testing/documents-client';
import type { TestServer, TestUser } from '../testing/test-server';

const FIRST_ATTEMPT = 1;

test('members answers isCurrentUserOnline for the tab that asks, not for another tab of the same user', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const connectedTab = randomUUID();
  const otherTab = randomUUID();
  const client = await connectToDocument({
    server,
    cookie: owner.cookie,
    documentId,
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
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const path = `${pathOf({ documentId, resource: DocumentResource.Members })}?${TAB_QUERY_KEY}=${tab}`;
  const answer: DocumentMembers = await (await request({ server, cookie: owner.cookie, path })).json();
  expect(answer.isCurrentUserOnline).toBe(true);
  client.close();
  await server.stop();
});

async function membersAnswerFor({
  server,
  user,
  documentId,
  query,
}: {
  server: TestServer;
  user: TestUser;
  documentId: string;
  query: Record<string, string>;
}): Promise<DocumentMembers> {
  const path = `${pathOf({ documentId, resource: DocumentResource.Members })}?${new URLSearchParams(query)}`;
  return (await request({ server, cookie: user.cookie, path })).json();
}

async function isAttemptSupersededFor(parameters: Parameters<typeof membersAnswerFor>[0]): Promise<boolean> {
  return (await membersAnswerFor(parameters)).isAttemptSuperseded;
}

async function isAttemptRestartedFor(parameters: Parameters<typeof membersAnswerFor>[0]): Promise<boolean> {
  return (await membersAnswerFor(parameters)).isAttemptRestarted;
}

function ticketQuery({ attempt, epoch }: CreatorTicket): Record<string, string> {
  return { [CREATOR_ATTEMPT_QUERY_KEY]: String(attempt), [CREATOR_EPOCH_QUERY_KEY]: epoch };
}

test('members answers that the first attempt is superseded once the holder reopens, and the newest is not', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const first = await openedBy({ server, user: owner, documentId });
  const second = await openedBy({ server, user: owner, documentId });
  const firstTicket = { attempt: first.creatorAttempt!, epoch: first.creatorEpoch! };
  const secondTicket = { attempt: second.creatorAttempt!, epoch: second.creatorEpoch! };
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query: ticketQuery(firstTicket) })).toBe(true);
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query: ticketQuery(secondTicket) })).toBe(false);
  await server.stop();
});

test('members answers that a ticket from another epoch is restarted and not superseded while the room is uncommitted', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const query = ticketQuery({ attempt: FIRST_ATTEMPT, epoch: randomUUID() });
  expect(await isAttemptRestartedFor({ server, user: owner, documentId, query })).toBe(true);
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query })).toBe(false);
  await server.stop();
});

test('members answers that a takeover is superseded and not restarted', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const first = await openedBy({ server, user: owner, documentId });
  await openedBy({ server, user: owner, documentId });
  const query = ticketQuery({ attempt: first.creatorAttempt!, epoch: first.creatorEpoch! });
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query })).toBe(true);
  expect(await isAttemptRestartedFor({ server, user: owner, documentId, query })).toBe(false);
  await server.stop();
});

test('members answers that a ticket from another epoch is not superseded once the room is committed', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const query = ticketQuery({ attempt: FIRST_ATTEMPT, epoch: randomUUID() });
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query })).toBe(false);
  expect(await isAttemptRestartedFor({ server, user: owner, documentId, query })).toBe(false);
  await server.stop();
});

test('members answers that an older attempt is superseded after the room is committed by a newer one', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const first = await openedBy({ server, user: owner, documentId });
  const second = await openedBy({ server, user: owner, documentId });
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const firstTicket = { attempt: first.creatorAttempt!, epoch: first.creatorEpoch! };
  const secondTicket = { attempt: second.creatorAttempt!, epoch: second.creatorEpoch! };
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query: ticketQuery(firstTicket) })).toBe(true);
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query: ticketQuery(secondTicket) })).toBe(false);
  await server.stop();
});

const UNCLAIMED_TICKETS: { name: string; query: Record<string, string> }[] = [
  { name: 'no ticket', query: {} },
  { name: 'an attempt without an epoch', query: { [CREATOR_ATTEMPT_QUERY_KEY]: '1' } },
  { name: 'an epoch without an attempt', query: { [CREATOR_EPOCH_QUERY_KEY]: 'epoch' } },
  { name: 'a zero attempt', query: { [CREATOR_ATTEMPT_QUERY_KEY]: '0', [CREATOR_EPOCH_QUERY_KEY]: 'epoch' } },
  { name: 'a fractional attempt', query: { [CREATOR_ATTEMPT_QUERY_KEY]: '1.5', [CREATOR_EPOCH_QUERY_KEY]: 'epoch' } },
  { name: 'a non-numeric attempt', query: { [CREATOR_ATTEMPT_QUERY_KEY]: 'abc', [CREATOR_EPOCH_QUERY_KEY]: 'epoch' } },
];

test.each(UNCLAIMED_TICKETS)('members answers not superseded and not restarted for $name', async ({ query }) => {
  const { server, documentId, owner } = await documentWithOwner();
  expect(await isAttemptSupersededFor({ server, user: owner, documentId, query })).toBe(false);
  expect(await isAttemptRestartedFor({ server, user: owner, documentId, query })).toBe(false);
  await server.stop();
});
