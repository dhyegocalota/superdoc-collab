import { DocumentRole, documentApiPath, HttpMethod, HttpStatus, RETRY_AFTER_HEADER, SELECTION_SUMMARY_COOLDOWN_MS, SELECTION_SUMMARY_FAILED_MESSAGE, SELECTION_SUMMARY_TOO_SOON_MESSAGE, SelectionSummaryState, TOPICS_REFRESH_TOO_SOON_MESSAGE, topicsRefreshApiPath } from '@superdoc-history/types';
import type { MockLanguageModelV4 } from 'ai/test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { INVALID_TIMELINE_QUERY_MESSAGE } from '../history/timeline-query';
import { readEvents } from '../testing/events-client';
import { memberWithRole } from '../testing/collaboration-client';
import { gatedModel, modelAnswering, readyModel } from '../testing/language-model';
import { postSelectionSummary, readSelectionSummary, readTopics, storyWithBlocks, twoAuthorsInTwoBlocks } from '../testing/timeline-client';
import { signedInUser, type TestServer } from '../testing/test-server';
import { JobOutcome } from './insights-worker';
import { chooseLanguageModel, LLM_BUSY_MESSAGE, LLM_MODEL_MISSING_MESSAGE } from './llm-client';

const POLL_TIMEOUT_MS = 15_000;
const MEMBER_QUERY = 'author=member';
const NO_MATCH_QUERY = 'term=zzz-nothing';
const SELECTION_ANSWER = { sentence: 'Member added a designer.', authors: ['Member'] };
const COOLDOWN_SECONDS = SELECTION_SUMMARY_COOLDOWN_MS / 1000;
const PROVIDER_SECRET = 'sk-test-secret';
const FOREIGN_ORIGIN = 'https://evil.example';
const INVALID_QUERIES = ['at=-5', 'at=abc', 'at=1.5', `topic=${'t'.repeat(201)}`];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function promptOf(model: MockLanguageModelV4, index = 0): string {
  return JSON.stringify(model.doGenerateCalls[index]!.prompt);
}

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
  expect(Number(second.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
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

test('a second editor on the same document inside the cooldown is 429 with Retry-After', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  const second = await refresh({ server, documentId, cookie: editor.cookie });
  expect(second.status).toBe(HttpStatus.TooManyRequests);
  expect(Number(second.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  client.close();
  await server.stop();
});

test('the same user refreshing again while the run is in flight gets 202, then 429 once it ends', async () => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: { topics: [{ name: 'Budget', blockIds: ['b0'] }] } });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  open();
  await server.services.insights.worker.idle();
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.TooManyRequests);
  client.close();
  await server.stop();
});

test('deleting a document forgets its refresh and summary cooldowns', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  server.services.insights.summaries.cooldown.start(documentId);
  expect(server.services.insights.topics.cooldown.size()).toBe(1);
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { method: HttpMethod.Delete, headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  expect(server.services.insights.topics.cooldown.size()).toBe(0);
  expect(server.services.insights.summaries.cooldown.size()).toBe(0);
  client.close();
  await server.stop();
});

test('summarizing a selection is 202 for an editor, 403 for a reader and 404 for a stranger, and a reader reads it', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const stranger = await signedInUser({ server, name: 'Stranger' });
  expect((await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).status).toBe(HttpStatus.Accepted);
  expect((await postSelectionSummary({ server, documentId, cookie: reader.cookie, query: MEMBER_QUERY })).status).toBe(HttpStatus.Forbidden);
  const strangerResponse = await postSelectionSummary({ server, documentId, cookie: stranger.cookie, query: MEMBER_QUERY });
  const unknownResponse = await postSelectionSummary({ server, documentId: randomUUID(), cookie: stranger.cookie, query: MEMBER_QUERY });
  expect(strangerResponse.status).toBe(HttpStatus.NotFound);
  expect(await strangerResponse.json()).toEqual(await unknownResponse.json());
  await server.services.insights.worker.idle();
  expect((await readSelectionSummary({ server, documentId, cookie: reader.cookie, query: MEMBER_QUERY })).summary).toMatchObject({ sentence: SELECTION_ANSWER.sentence, isStale: false });
  await server.stop();
});

test('filtering by person sends only that person runs', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  await server.services.insights.worker.idle();
  const prompt = promptOf(model);
  expect(prompt).toContain(' a designer');
  expect(prompt).not.toContain(' more money');
  expect(prompt).not.toContain('@example.com');
  await server.stop();
});

test('a second POST with the same filter is 200 from the cache and another filter inside the cooldown is 429', async () => {
  const model = modelAnswering(SELECTION_ANSWER, SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  expect((await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  const cached = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(cached.status).toBe(HttpStatus.Ok);
  expect(await cached.json()).toMatchObject({ state: SelectionSummaryState.Ready });
  const tooSoon = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'term=budget' });
  expect(tooSoon.status).toBe(HttpStatus.TooManyRequests);
  expect(await tooSoon.json()).toEqual({ error: SELECTION_SUMMARY_TOO_SOON_MESSAGE });
  const retryAfter = Number(tooSoon.headers.get(RETRY_AFTER_HEADER));
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(COOLDOWN_SECONDS);
  expect(model.doGenerateCalls).toHaveLength(1);
  await server.stop();
});

test('a selection with no edits is none and its POST costs nothing', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const none = { state: SelectionSummaryState.None, summary: null, failure: null, isModelAvailable: true };
  expect(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: NO_MATCH_QUERY })).toEqual(none);
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: NO_MATCH_QUERY });
  expect(response.status).toBe(HttpStatus.Ok);
  expect(await response.json()).toEqual(none);
  expect(server.services.insights.selection.cooldown.size()).toBe(0);
  expect(model.doGenerateCalls).toHaveLength(0);
  await server.stop();
});

test('polling the GET never calls the model', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const views = await Promise.all([1, 2, 3].map(() => readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })));
  expect(views.map((view) => view.state)).toEqual([SelectionSummaryState.None, SelectionSummaryState.None, SelectionSummaryState.None]);
  expect(model.doGenerateCalls).toHaveLength(0);
  await server.stop();
});

test('topic and period narrow the selection', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${editor.id}` });
  await server.services.insights.worker.idle();
  const prompt = promptOf(model);
  expect(prompt).toContain(' a designer');
  expect(prompt).not.toContain(' more money');
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'at=0' })).state).toBe(SelectionSummaryState.None);
  await server.stop();
});

test('a topic that no longer exists selects nothing', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, owner, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const blockId = (await readEvents({ server, documentId, cookie: owner.cookie })).find((event) => event.inserted === ' a designer')!.blockId;
  const repository = server.services.insightsRepository;
  repository.saveTopics({ documentId, topics: [{ id: null, name: 'Hiring', blockIds: [blockId] }], computedAtSequence: 1 });
  const oldId = repository.topics(documentId)[0]!.id;
  expect((await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${oldId}` })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  repository.saveTopics({ documentId, topics: [{ id: null, name: 'Staff', blockIds: [blockId] }], computedAtSequence: 2 });
  const newId = repository.topics(documentId)[0]!.id;
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${oldId}` })).state).toBe(SelectionSummaryState.None);
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${newId}` })).state).toBe(SelectionSummaryState.None);
  await server.stop();
});

test.each(INVALID_QUERIES)('an invalid selection query %s is 400 for the GET and the POST', async (query) => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  const get = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}/summaries/selection?${query}`, { headers: { cookie: editor.cookie } });
  const post = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query });
  expect([get.status, post.status]).toEqual([HttpStatus.BadRequest, HttpStatus.BadRequest]);
  expect(await get.json()).toEqual({ error: INVALID_TIMELINE_QUERY_MESSAGE });
  expect(await post.json()).toEqual({ error: INVALID_TIMELINE_QUERY_MESSAGE });
  await server.stop();
});

test('an empty at is no period', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  expect(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `${MEMBER_QUERY}&at=` })).toEqual(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY }));
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `${MEMBER_QUERY}&at=` });
  await server.services.insights.worker.idle();
  const withEmptyAt = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `${MEMBER_QUERY}&at=` });
  const without = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(withEmptyAt.summary!.key).toBe(without.summary!.key);
  await server.stop();
});

test('a topic recompute stales topic summaries only', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const model = modelAnswering(SELECTION_ANSWER, SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const { worker } = server.services.insights;
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  await worker.idle();
  vi.setSystemTime(Date.now() + SELECTION_SUMMARY_COOLDOWN_MS);
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${editor.id}` });
  await worker.idle();
  server.services.insightsRepository.markPending(documentId);
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).summary?.isStale).toBe(false);
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${editor.id}` })).summary?.isStale).toBe(true);
  await server.stop();
});

test('without a model the GET is failed with the reason and the POST is 503', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks();
  expect(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).toEqual({ state: SelectionSummaryState.Failed, summary: null, failure: LLM_MODEL_MISSING_MESSAGE, isModelAvailable: false });
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(response.status).toBe(HttpStatus.ServiceUnavailable);
  expect(await response.json()).toEqual({ error: LLM_MODEL_MISSING_MESSAGE });
  await server.stop();
});

test('a full worker answers 503 busy', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  vi.spyOn(server.services.insights.worker, 'run').mockReturnValue(JobOutcome.Busy);
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(response.status).toBe(HttpStatus.ServiceUnavailable);
  expect(await response.json()).toEqual({ error: LLM_BUSY_MESSAGE });
  expect(server.services.insights.selection.cooldown.size()).toBe(0);
  await server.stop();
});

test('a cross-site form post is refused', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}/summaries/selection?${MEMBER_QUERY}`, { method: HttpMethod.Post, headers: { cookie: editor.cookie, origin: FOREIGN_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' } });
  expect(response.status).toBe(HttpStatus.Forbidden);
  await server.stop();
});

test('the key never reaches a log or a response', async () => {
  const provider = createServer((_request, response) => {
    response.statusCode = HttpStatus.InternalServerError;
    response.end('{}');
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const { port } = provider.address() as AddressInfo;
  const languageModel = chooseLanguageModel({ model: 'm', apiKey: PROVIDER_SECRET, baseUrl: `http://127.0.0.1:${port}/api/v1` });
  const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')].map((spy) => spy.mockImplementation(() => undefined));
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel });
  const posted = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  const postedBody = await posted.text();
  await server.services.insights.worker.idle();
  const view = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(view.failure).toBe(SELECTION_SUMMARY_FAILED_MESSAGE);
  expect(JSON.stringify([postedBody, view])).not.toContain(PROVIDER_SECRET);
  expect(spies.flatMap((spy) => spy.mock.calls).map((call) => JSON.stringify(call)).join('')).not.toContain(PROVIDER_SECRET);
  await server.stop();
  await new Promise((resolve) => provider.close(resolve));
});

test('deleting a document forgets its selection cooldown', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  expect((await postSelectionSummary({ server, documentId, cookie: owner.cookie, query: MEMBER_QUERY })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  expect(server.services.insights.selection.cooldown.size()).toBe(1);
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { method: HttpMethod.Delete, headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  expect(server.services.insights.selection.cooldown.size()).toBe(0);
  await server.stop();
});
