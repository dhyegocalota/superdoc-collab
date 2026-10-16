import { DocumentRole, HttpStatus, TOPICS_REFRESH_TOO_SOON_MESSAGE, topicsRefreshApiPath } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { memberWithRole } from '../testing/collaboration-client';
import { gatedModel, readyModel } from '../testing/language-model';
import { readTopics, storyWithBlocks } from '../testing/timeline-client';
import { signedInUser, type TestServer } from '../testing/test-server';

const POLL_TIMEOUT_MS = 15_000;

function refresh({ server, documentId, cookie }: { server: TestServer; documentId: string; cookie: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${topicsRefreshApiPath(documentId)}`, { method: 'POST', headers: { cookie, origin: server.baseUrl } });
}

test('refresh is 202 for an editor, 403 for a reader, 404 for a stranger', async () => {
  const { server, documentId, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const statuses = await Promise.all([editor, reader, stranger].map(async (user) => (await refresh({ server, documentId, cookie: user.cookie })).status));
  expect(statuses).toEqual([HttpStatus.Accepted, HttpStatus.Forbidden, HttpStatus.NotFound]);
  client.close();
  await server.stop();
});

test('a second refresh by the same user inside the cooldown is 429 with Retry-After, another document is 202', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const otherDocumentId = randomUUID();
  server.services.documents.create({ id: otherDocumentId, title: 'Other', ownerUserId: owner.id });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  const second = await refresh({ server, documentId, cookie: owner.cookie });
  expect(second.status).toBe(HttpStatus.TooManyRequests);
  expect(await second.json()).toEqual({ error: TOPICS_REFRESH_TOO_SOON_MESSAGE });
  expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
  expect((await refresh({ server, documentId: otherDocumentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  client.close();
  await server.stop();
});

test('a refresh while a run is in flight returns 202 without a second model call', async () => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: { topics: [{ name: 'Budget', blockIds: ['b0'] }] } });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(() => model.doGenerateCalls.length, { timeout: POLL_TIMEOUT_MS }).toBe(1);
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  open();
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  client.close();
  await server.stop();
});
