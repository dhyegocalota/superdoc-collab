import {
  DocumentRole,
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  RETRY_AFTER_HEADER,
  RETRY_AFTER_SECONDS,
  SECOND_MS,
  SUMMARIZE_COOLDOWN_MS,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  SUMMARIZE_BUSY_MESSAGE,
  SelectionSummaryState,
  SummarizeOutcome,
  SummarizeStep,
  selectionSummaryApiPath,
  UTC_TIME_ZONE,
} from '@superdoc-collab/types';
import type { MockLanguageModelV4 } from 'ai/test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { INVALID_TIMELINE_QUERY_MESSAGE } from '../history/timeline-query';
import { readEvents } from '../testing/events-client';
import { memberWithRole } from '../testing/collaboration-client';
import { gatedModel, modelAnswering, readyModel } from '../testing/language-model';
import {
  postSelectionSummary,
  readSelectionSummary,
  readTimeline,
  storyWithBlocks,
  twoAuthorsInTwoBlocks,
  zonedQuery,
} from '../testing/timeline-client';
import { signedInUser, type TestServer } from '../testing/test-server';
import { JobOutcome } from './insights-job-runner';
import { chooseLanguageModel, LLM_MODEL_MISSING_MESSAGE } from './llm-client';

const MEMBER_QUERY = 'author=member';
const NO_MATCH_QUERY = 'term=zzz-nothing';
const SELECTION_ANSWER = { sentence: 'Member added a designer.', authors: ['Member'] };
const COOLDOWN_SECONDS = SUMMARIZE_COOLDOWN_MS / SECOND_MS;
const PROVIDER_SECRET = 'sk-test-secret';
const FOREIGN_ORIGIN = 'https://evil.example';
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const INVALID_QUERIES = ['at=-5', 'at=abc', 'at=1.5', `at=${'9'.repeat(20)}`, `topic=${'t'.repeat(201)}`];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function promptOf(model: MockLanguageModelV4, index = 0): string {
  return JSON.stringify(model.doGenerateCalls[index]!.prompt);
}

test('POST /:documentId/topics/refresh no longer exists', async () => {
  const { server, documentId, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Topics })}/refresh`, {
    method: HttpMethod.Post,
    headers: { cookie: editor.cookie, origin: server.baseUrl },
  });
  expect(response.status).toBe(HttpStatus.NotFound);
  client.close();
  await server.stop();
});

test('deleting a document forgets its summarize cooldown and step', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const { selection } = server.services.insights;
  selection.cooldown.start(documentId);
  selection.setStep({ documentId, step: SummarizeStep.Summarizing });
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, {
    method: HttpMethod.Delete,
    headers: { cookie: owner.cookie, origin: server.baseUrl },
  });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  expect(selection.cooldown.size()).toBe(0);
  client.close();
  await server.stop();
});

test('summarizing a selection is 202 for an editor, 403 for a reader and 404 for a stranger, and a reader reads it', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const stranger = await signedInUser({ server, name: 'Stranger' });
  expect((await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).status).toBe(HttpStatus.Accepted);
  expect((await postSelectionSummary({ server, documentId, cookie: reader.cookie, query: MEMBER_QUERY })).status).toBe(
    HttpStatus.Forbidden,
  );
  const strangerResponse = await postSelectionSummary({ server, documentId, cookie: stranger.cookie, query: MEMBER_QUERY });
  const unknownResponse = await postSelectionSummary({ server, documentId: randomUUID(), cookie: stranger.cookie, query: MEMBER_QUERY });
  expect(strangerResponse.status).toBe(HttpStatus.NotFound);
  expect(await strangerResponse.json()).toEqual(await unknownResponse.json());
  await server.services.insights.jobRunner.idle();
  expect((await readSelectionSummary({ server, documentId, cookie: reader.cookie, query: MEMBER_QUERY })).summary).toMatchObject({
    sentence: SELECTION_ANSWER.sentence,
    isStale: false,
  });
  await server.stop();
});

test('filtering by person sends only that person runs', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  await server.services.insights.jobRunner.idle();
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
  await server.services.insights.jobRunner.idle();
  const cached = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(cached.status).toBe(HttpStatus.Ok);
  expect(await cached.json()).toMatchObject({ state: SelectionSummaryState.Ready });
  const tooSoon = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'term=designer' });
  expect(tooSoon.status).toBe(HttpStatus.TooManyRequests);
  expect(await tooSoon.json()).toEqual({ error: SUMMARIZE_BUSY_MESSAGE });
  const retryAfter = Number(tooSoon.headers.get(RETRY_AFTER_HEADER));
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(COOLDOWN_SECONDS);
  expect(model.doGenerateCalls).toHaveLength(1);
  await server.stop();
});

test('a selection with no edits is none and its POST costs nothing', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const none = { state: SelectionSummaryState.None, summary: null, failure: null, isModelAvailable: true, step: SummarizeStep.Idle };
  expect(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: NO_MATCH_QUERY })).toEqual(none);
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: NO_MATCH_QUERY });
  expect(response.status).toBe(HttpStatus.Ok);
  expect(await response.json()).toEqual({ ...none, outcome: SummarizeOutcome.UpToDate });
  expect(server.services.insights.selection.cooldown.size()).toBe(0);
  expect(model.doGenerateCalls).toHaveLength(0);
  await server.stop();
});

test('polling the GET never calls the model', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const views = await Promise.all(
    [1, 2, 3].map(() => readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })),
  );
  expect(views.map((view) => view.state)).toEqual([SelectionSummaryState.None, SelectionSummaryState.None, SelectionSummaryState.None]);
  expect(model.doGenerateCalls).toHaveLength(0);
  await server.stop();
});

test('topic and period narrow the selection', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${editor.id}` });
  await server.services.insights.jobRunner.idle();
  const prompt = promptOf(model);
  expect(prompt).toContain(' a designer');
  expect(prompt).not.toContain(' more money');
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'at=0' })).state).toBe(SelectionSummaryState.None);
  const period = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'at=0' });
  expect(period.status).toBe(HttpStatus.Ok);
  expect(model.doGenerateCalls).toHaveLength(1);
  await server.stop();
});

test('a topic that no longer exists selects nothing', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, owner, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const blockId = (await readEvents({ server, documentId, cookie: owner.cookie })).find(
    (event) => event.inserted === ' a designer',
  )!.blockId;
  const repository = server.services.insightsRepository;
  repository.saveTopics({ documentId, topics: [{ id: null, name: 'Hiring', blockIds: [blockId] }], computedAtSequence: 1 });
  const oldId = repository.topics(documentId)[0]!.id;
  expect((await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${oldId}` })).status).toBe(
    HttpStatus.Accepted,
  );
  await server.services.insights.jobRunner.idle();
  repository.saveTopics({ documentId, topics: [{ id: null, name: 'Staff', blockIds: [blockId] }], computedAtSequence: 2 });
  const newId = repository.topics(documentId)[0]!.id;
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${oldId}` })).state).toBe(
    SelectionSummaryState.None,
  );
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${newId}` })).state).toBe(
    SelectionSummaryState.None,
  );
  await server.stop();
});

test.each(INVALID_QUERIES)('an invalid selection query %s is 400 for the GET and the POST', async (query) => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  const get = await fetch(`${server.baseUrl}${selectionSummaryApiPath(documentId)}?${zonedQuery({ query })}`, {
    headers: { cookie: editor.cookie },
  });
  const post = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query });
  expect([get.status, post.status]).toEqual([HttpStatus.BadRequest, HttpStatus.BadRequest]);
  expect(await get.json()).toEqual({ error: INVALID_TIMELINE_QUERY_MESSAGE });
  expect(await post.json()).toEqual({ error: INVALID_TIMELINE_QUERY_MESSAGE });
  await server.stop();
});

function selectionRowCount(server: TestServer): number {
  const row = server.database.sqlite.prepare('select count(*) as total from selection_summaries').get() as { total: number };
  return row.total;
}

test('a whole-document selection summarized in one zone is served in another from the same row', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const model = modelAnswering(SELECTION_ANSWER, SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY, timeZone: UTC_TIME_ZONE });
  await server.services.insights.jobRunner.idle();
  const otherZone = await readSelectionSummary({
    server,
    documentId,
    cookie: editor.cookie,
    query: MEMBER_QUERY,
    timeZone: SAO_PAULO_TIME_ZONE,
  });
  vi.setSystemTime(Date.now() + SUMMARIZE_COOLDOWN_MS);
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY, timeZone: SAO_PAULO_TIME_ZONE });
  await server.services.insights.jobRunner.idle();
  expect(otherZone.state).toBe(SelectionSummaryState.Ready);
  expect(selectionRowCount(server)).toBe(1);
  await server.stop();
});

test('a period selection summarized in one zone is not served for another', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const model = modelAnswering(SELECTION_ANSWER, SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const timeline = await readTimeline({ server, documentId, cookie: editor.cookie, timeZone: UTC_TIME_ZONE });
  const query = `${MEMBER_QUERY}&at=${timeline.bins.find((bin) => Object.keys(bin.byBand).length > 0)!.start}`;
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query, timeZone: UTC_TIME_ZONE });
  await server.services.insights.jobRunner.idle();
  const otherZone = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query, timeZone: SAO_PAULO_TIME_ZONE });
  vi.setSystemTime(Date.now() + SUMMARIZE_COOLDOWN_MS);
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query, timeZone: SAO_PAULO_TIME_ZONE });
  await server.services.insights.jobRunner.idle();
  expect(otherZone.state).toBe(SelectionSummaryState.None);
  expect(selectionRowCount(server)).toBe(2);
  await server.stop();
});

test('an empty at is no period', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  expect(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `${MEMBER_QUERY}&at=` })).toEqual(
    await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY }),
  );
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `${MEMBER_QUERY}&at=` });
  await server.services.insights.jobRunner.idle();
  const withEmptyAt = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `${MEMBER_QUERY}&at=` });
  const without = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(withEmptyAt.summary!.key).toBe(without.summary!.key);
  await server.stop();
});

test('a topic recompute stales topic summaries only', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const model = modelAnswering(SELECTION_ANSWER, SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const { jobRunner } = server.services.insights;
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  await jobRunner.idle();
  vi.setSystemTime(Date.now() + SUMMARIZE_COOLDOWN_MS);
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${editor.id}` });
  await jobRunner.idle();
  server.services.insightsRepository.markPending(documentId);
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).summary?.isStale).toBe(false);
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: `topic=${editor.id}` })).summary?.isStale).toBe(
    true,
  );
  await server.stop();
});

test('without a model the GET is failed with the reason and the POST is 503', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks();
  expect(await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).toEqual({
    state: SelectionSummaryState.Failed,
    summary: null,
    failure: LLM_MODEL_MISSING_MESSAGE,
    isModelAvailable: false,
    step: SummarizeStep.Idle,
  });
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(response.status).toBe(HttpStatus.ServiceUnavailable);
  expect(await response.json()).toEqual({ error: LLM_MODEL_MISSING_MESSAGE });
  expect(response.headers.get(RETRY_AFTER_HEADER)).toBe(String(RETRY_AFTER_SECONDS));
  await server.stop();
});

test('a full worker answers 429 with SUMMARIZE_BUSY_MESSAGE', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  vi.spyOn(server.services.insights.jobRunner, 'run').mockReturnValue(JobOutcome.Busy);
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(response.status).toBe(HttpStatus.TooManyRequests);
  expect(await response.json()).toEqual({ error: SUMMARIZE_BUSY_MESSAGE });
  expect(response.headers.get(RETRY_AFTER_HEADER)).toBe(String(RETRY_AFTER_SECONDS));
  expect(server.services.insights.selection.cooldown.size()).toBe(0);
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).state).toBe(
    SelectionSummaryState.None,
  );
  await server.stop();
});

test('an exhausted hourly cap answers 429 with the seconds until a slot frees', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  vi.spyOn(server.services.insights.jobRunner, 'hasCallBudget').mockReturnValue(false);
  vi.spyOn(server.services.insights.jobRunner, 'retryAfterMs').mockReturnValue(90 * SECOND_MS);
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(response.status).toBe(HttpStatus.TooManyRequests);
  expect(await response.json()).toEqual({ error: SUMMARIZE_BUSY_MESSAGE });
  expect(response.headers.get(RETRY_AFTER_HEADER)).toBe('90');
  await server.stop();
});

test('a second POST inside the cooldown answers 429 with one Retry-After and SUMMARIZE_BUSY_MESSAGE', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  expect((await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.jobRunner.idle();
  const second = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'term=designer' });
  expect(second.status).toBe(HttpStatus.TooManyRequests);
  expect(await second.json()).toEqual({ error: SUMMARIZE_BUSY_MESSAGE });
  expect(second.headers.get(RETRY_AFTER_HEADER)).toMatch(/^\d+$/);
  expect(model.doGenerateCalls).toHaveLength(1);
  await server.stop();
});

test("the Retry-After is the longer of the cooldown and the model's busy wait", async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({
    languageModel: readyModel(modelAnswering(SELECTION_ANSWER, SELECTION_ANSWER)),
  });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  await server.services.insights.jobRunner.idle();
  const retryAfterOf = async () =>
    (await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: 'term=designer' })).headers.get(RETRY_AFTER_HEADER);
  vi.spyOn(server.services.insights.jobRunner, 'hasCallBudget').mockReturnValue(false);
  const busyWait = vi.spyOn(server.services.insights.jobRunner, 'retryAfterMs');
  busyWait.mockReturnValue(90 * SECOND_MS);
  expect(await retryAfterOf()).toBe(String(90));
  busyWait.mockReturnValue(5 * SECOND_MS);
  expect(await retryAfterOf()).toBe(String(COOLDOWN_SECONDS));
  await server.stop();
});

test('GET selection returns step idle when no job runs', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).step).toBe(SummarizeStep.Idle);
  await server.stop();
});

test('POST selection answers 200 and starts no job when nothing is stale', async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  await server.services.insights.jobRunner.idle();
  const run = vi.spyOn(server.services.insights.jobRunner, 'run');
  const response = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(response.status).toBe(HttpStatus.Ok);
  expect(await response.json()).toMatchObject({
    state: SelectionSummaryState.Ready,
    step: SummarizeStep.Idle,
    outcome: SummarizeOutcome.UpToDate,
  });
  expect(run).not.toHaveBeenCalled();
  expect(model.doGenerateCalls).toHaveLength(1);
  await server.stop();
});

test('POST selection answers 202 with the running step while a job runs, started or already running', async () => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: SELECTION_ANSWER });
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(model) });
  const started = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  const alreadyRunning = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect([started.status, alreadyRunning.status]).toEqual([HttpStatus.Accepted, HttpStatus.Accepted]);
  expect(await started.json()).toMatchObject({
    state: SelectionSummaryState.Running,
    step: SummarizeStep.Summarizing,
    outcome: SummarizeOutcome.Started,
  });
  expect(await alreadyRunning.json()).toMatchObject({
    state: SelectionSummaryState.Running,
    step: SummarizeStep.Summarizing,
    outcome: SummarizeOutcome.Running,
  });
  open();
  await server.services.insights.jobRunner.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  await server.stop();
});

test('a cross-site form post is refused', async () => {
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel: readyModel(modelAnswering(SELECTION_ANSWER)) });
  const response = await fetch(`${server.baseUrl}${selectionSummaryApiPath(documentId)}?${MEMBER_QUERY}`, {
    method: HttpMethod.Post,
    headers: { cookie: editor.cookie, origin: FOREIGN_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
  });
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
  const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')].map((spy) =>
    spy.mockImplementation(() => undefined),
  );
  const { server, documentId, editor } = await twoAuthorsInTwoBlocks({ languageModel });
  const posted = await postSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  const postedBody = await posted.text();
  await server.services.insights.jobRunner.idle();
  const view = await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY });
  expect(view.failure).toBe(SELECTION_SUMMARY_FAILED_MESSAGE);
  expect(JSON.stringify([postedBody, view])).not.toContain(PROVIDER_SECRET);
  expect(
    spies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => JSON.stringify(call))
      .join(''),
  ).not.toContain(PROVIDER_SECRET);
  await server.stop();
  await new Promise((resolve) => provider.close(resolve));
});
