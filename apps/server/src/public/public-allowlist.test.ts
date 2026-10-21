import {
  ClientActor,
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  publicApiPath,
  publicSummaryApiPath,
  selectionSummaryApiPath,
  type PublicOpened,
  type PublicSummary,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { publicRoom } from '../testing/public-room';
import type { TestServer } from '../testing/test-server';

const SELECTION_KEY = 'a'.repeat(64);
const SENTENCE = 'Ana raised the budget.';
const SAVED_AT = 1_800_000_000_000;
const AUTHORS = [{ name: 'Ana', actor: ClientActor.Human }];

function send({
  server,
  path,
  method = HttpMethod.Get,
  headers = {},
}: {
  server: TestServer;
  path: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
}) {
  return fetch(`${server.baseUrl}${path}`, { method, headers });
}

function spyOnEveryTrigger(server: TestServer) {
  const { insights, scheduler, versions } = server.services;
  return [
    vi.spyOn(insights.topics, 'ensure'),
    vi.spyOn(insights.summarize, 'request'),
    vi.spyOn(insights.jobRunner, 'consumeDocumentCall'),
    vi.spyOn(scheduler, 'blocks'),
    vi.spyOn(scheduler, 'version'),
    vi.spyOn(versions, 'load'),
  ];
}

test('the summary is null while nothing was summarized', async () => {
  const { server, documentId } = await publicRoom();
  const response = await send({ server, path: publicSummaryApiPath(documentId) });
  expect(response.status).toBe(HttpStatus.Ok);
  expect(await response.json()).toEqual({ summary: null } satisfies PublicSummary);
  await server.stop();
});

test('the summary is the latest stored sentence with its date and authors', async () => {
  const { server, documentId } = await publicRoom();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVED_AT);
  server.services.insightsRepository.saveSelectionSummary({
    documentId,
    key: SELECTION_KEY,
    sentence: SENTENCE,
    authors: AUTHORS,
    computedAtSequence: 12,
    topicsUpdatedAt: null,
  });
  vi.useRealTimers();
  const body: PublicSummary = await (await send({ server, path: publicSummaryApiPath(documentId) })).json();
  expect(body).toEqual({ summary: { sentence: SENTENCE, authors: AUTHORS, computedAtSequence: 12, updatedAt: SAVED_AT } });
  await server.stop();
});

test('the summary of a missing or private document is not found', async () => {
  const { server, documentId } = await publicRoom();
  server.services.documents.setPublic({ documentId, isPublic: false });
  const privateAnswer = await send({ server, path: publicSummaryApiPath(documentId) });
  const missingAnswer = await send({ server, path: publicSummaryApiPath(randomUUID()) });
  expect([privateAnswer.status, missingAnswer.status]).toEqual([HttpStatus.NotFound, HttpStatus.NotFound]);
  expect(await privateAnswer.text()).toBe(await missingAnswer.text());
  await server.stop();
});

test.each([HttpMethod.Post, HttpMethod.Put, HttpMethod.Patch, HttpMethod.Delete])(
  'a %s to the public paths is not found',
  async (method) => {
    const { server, documentId } = await publicRoom();
    const triggers = spyOnEveryTrigger(server);
    const answers = await Promise.all(
      [publicApiPath(documentId), publicSummaryApiPath(documentId)].map((path) => send({ server, path, method })),
    );
    expect(answers.map((answer) => answer.status)).toEqual([HttpStatus.NotFound, HttpStatus.NotFound]);
    triggers.forEach((trigger) => expect(trigger).not.toHaveBeenCalled());
    await server.stop();
  },
);

test('nothing but the document and its summary exists under the public path', async () => {
  const { server, documentId } = await publicRoom();
  const triggers = spyOnEveryTrigger(server);
  const resources = [...Object.values(DocumentResource), 'edits', 'summaries/selection', 'timeline/edits'];
  const answers = await Promise.all(resources.map((resource) => send({ server, path: `${publicApiPath(documentId)}/${resource}` })));
  expect(answers.map((answer) => answer.status)).toEqual(resources.map(() => HttpStatus.NotFound));
  triggers.forEach((trigger) => expect(trigger).not.toHaveBeenCalled());
  await server.stop();
});

test('every document route and the summarize post refuse a caller with no session, even one holding a room token', async () => {
  const { server, documentId } = await publicRoom();
  const triggers = spyOnEveryTrigger(server);
  const opened: PublicOpened = await (await send({ server, path: publicApiPath(documentId) })).json();
  if (!('roomToken' in opened)) throw new Error('A visitor was expected');
  const headers = { authorization: `Bearer ${opened.roomToken}` };
  const reads = Object.values(DocumentResource).map((resource) =>
    send({ server, path: documentApiPath({ documentId, resource }), headers }),
  );
  const summarize = send({
    server,
    path: selectionSummaryApiPath(documentId),
    method: HttpMethod.Post,
    headers: { ...headers, origin: server.baseUrl },
  });
  const overview = send({ server, path: documentApiPath({ documentId }), headers });
  const statuses = (await Promise.all([...reads, summarize, overview])).map((answer) => answer.status);
  expect(statuses).toEqual(statuses.map(() => HttpStatus.Unauthorized));
  triggers.forEach((trigger) => expect(trigger).not.toHaveBeenCalled());
  await server.stop();
});
