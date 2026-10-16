import { TOPICS_FAILED_MESSAGE, TOPICS_INTERRUPTED_MESSAGE, TopicState, documentApiPath, DocumentResource, DocumentRole, TOPIC_RECOMPUTE_NEW_BLOCKS, topicsRefreshApiPath, TimelineBandKind } from '@superdoc-history/types';
import { MAX_TOPICS } from '@superdoc-history/history';
import { writeStory } from '@superdoc-history/history/testing';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { connectToDocument } from '../testing/collaboration-client';
import { readEvents } from '../testing/events-client';
import { gatedModel, modelAnswering, readyModel } from '../testing/language-model';
import { readTimeline, readTopics, storyWithBlocks } from '../testing/timeline-client';
import { signedInUser, startTestServer } from '../testing/test-server';
import { chooseLanguageModel, LLM_MODEL_MISSING_MESSAGE } from './llm-client';
import { INSIGHTS_JOB_FAILED_MESSAGE } from './insights-worker';
import { TOPIC_RECOMPUTE_MIN_INTERVAL_MS, UNKNOWN_TOPIC_BLOCKS_MESSAGE } from './topics-service';

const POLL_TIMEOUT_MS = 15_000;
const SECRET = 'sk-test-secret';
const SERVER_ERROR_STATUS = 500;
const TWELVE = 12;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function topicsAnswer(blockIds: string[], name = 'Budget') {
  return { topics: [{ name, blockIds }] };
}

function blockTexts(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Paragraph ${index}`);
}

test('a twelve-topic answer is saved as eight topics and the prompt carries no email', async () => {
  const model = modelAnswering({ topics: Array.from({ length: TWELVE }, (_, index) => ({ name: `T${index}`, blockIds: [`b${index}`] })) });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: blockTexts(TWELVE) });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status.state, { timeout: POLL_TIMEOUT_MS }).toBe(TopicState.Ready);
  expect((await readTopics({ server, documentId, cookie: owner.cookie })).topics).toHaveLength(MAX_TOPICS);
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).not.toContain('@example.com');
  client.close();
  await server.stop();
});

test('unknown block ids are logged once and the topics are saved', async () => {
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const model = modelAnswering(topicsAnswer(['b0', 'gone-1', 'gone-2']));
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).topics.map((topic) => topic.name), { timeout: POLL_TIMEOUT_MS }).toEqual(['Budget']);
  expect(warnings.mock.calls.filter(([line]) => String(line).startsWith(UNKNOWN_TOPIC_BLOCKS_MESSAGE))).toHaveLength(1);
  client.close();
  await server.stop();
});

test('a recompute keeps the id of a topic that keeps its blocks', async () => {
  const model = modelAnswering(topicsAnswer(['b0']), topicsAnswer(['b0'], 'Costs'));
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status.state, { timeout: POLL_TIMEOUT_MS }).toBe(TopicState.Ready);
  const [budget] = server.services.insightsRepository.topics(documentId);
  server.services.insightsRepository.saveSummaries({ summaries: [{ topicId: budget!.id, sentence: 'Costs rose.' }], computedAtSequence: 1 });
  const refreshed = await fetch(`${server.baseUrl}${topicsRefreshApiPath(documentId)}`, { method: 'POST', headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(refreshed.status).toBe(202);
  await expect.poll(() => server.services.insightsRepository.topics(documentId).map((topic) => [topic.id, topic.name]), { timeout: POLL_TIMEOUT_MS }).toEqual([[budget!.id, 'Costs']]);
  expect(server.services.insightsRepository.summaries(documentId).map((summary) => summary.sentence)).toEqual(['Costs rose.']);
  client.close();
  await server.stop();
});

test('malformed output fails with the generic message', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(modelAnswering('not json')), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status, { timeout: POLL_TIMEOUT_MS }).toMatchObject({ state: TopicState.Failed, failure: TOPICS_FAILED_MESSAGE });
  expect(errors).toHaveBeenCalledTimes(1);
  client.close();
  await server.stop();
});

test('no LLM fails with the configuration reason', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  expect((await readTopics({ server, documentId, cookie: owner.cookie })).status).toMatchObject({ state: TopicState.Failed, failure: LLM_MODEL_MISSING_MESSAGE });
  expect((await readTimeline({ server, documentId, cookie: owner.cookie })).bands.map((band) => band.kind)).toEqual([TimelineBandKind.Author]);
  client.close();
  await server.stop();
});

test('refresh without an LLM fails without calling anything', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const blocks = vi.spyOn(server.services.scheduler, 'blocks');
  const refreshed = await fetch(`${server.baseUrl}${topicsRefreshApiPath(documentId)}`, { method: 'POST', headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(refreshed.status).toBe(202);
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status, { timeout: POLL_TIMEOUT_MS }).toMatchObject({ state: TopicState.Failed, failure: LLM_MODEL_MISSING_MESSAGE });
  expect(blocks).not.toHaveBeenCalled();
  client.close();
  await server.stop();
});

test('an empty document is ready with no topics', async () => {
  const model = modelAnswering(topicsAnswer(['b0']));
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['', '  '] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status.state, { timeout: POLL_TIMEOUT_MS }).toBe(TopicState.Ready);
  expect((await readTopics({ server, documentId, cookie: owner.cookie })).topics).toEqual([]);
  expect(model.doGenerateCalls).toHaveLength(0);
  client.close();
  await server.stop();
});

test('two concurrent first opens call the model once', async () => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: topicsAnswer(['b0']) });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  const [first, second] = await Promise.all([readTopics({ server, documentId, cookie: owner.cookie }), readTopics({ server, documentId, cookie: owner.cookie })]);
  expect([first.status.state, second.status.state]).toEqual([TopicState.Pending, TopicState.Pending]);
  open();
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status.state, { timeout: POLL_TIMEOUT_MS }).toBe(TopicState.Ready);
  expect(model.doGenerateCalls).toHaveLength(1);
  client.close();
  await server.stop();
});

test('a job whose document is deleted mid-call is logged once', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: topicsAnswer(['b0']) });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(() => model.doGenerateCalls.length, { timeout: POLL_TIMEOUT_MS }).toBe(1);
  client.close();
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { method: 'DELETE', headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(deleted.ok).toBe(true);
  open();
  await server.services.insights.worker.idle();
  expect(errors.mock.calls.filter(([line]) => String(line).startsWith(INSIGHTS_JOB_FAILED_MESSAGE))).toHaveLength(1);
  expect(unhandled).not.toHaveBeenCalled();
  process.off('unhandledRejection', unhandled);
  await server.stop();
});

test('a pending set left by a crash is failed at boot', async () => {
  const { server, documentId, client } = await storyWithBlocks({ texts: ['Budget up'] });
  server.services.insightsRepository.markPending(documentId);
  client.close();
  await server.stop();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  expect(restarted.services.insightsRepository.status(documentId)).toMatchObject({ state: TopicState.Failed, failure: TOPICS_INTERRUPTED_MESSAGE });
  await restarted.stop();
});

test('prompts escape markup and carry no email', async () => {
  const model = modelAnswering(topicsAnswer(['b0']), { summaries: [] });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['<b>x</b> & y'] });
  const editor = await signedInUser({ server, name: 'Ana <script>' });
  server.services.documents.grant({ documentId, userId: editor.id, role: DocumentRole.Editor });
  const editorClient = await connectToDocument({ server, cookie: editor.cookie, documentId });
  writeStory({ document: editorClient.document, texts: ['<b>x</b> & y <i>z'] });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).some((event) => event.authors.some((author) => author.id === editor.id)), { timeout: POLL_TIMEOUT_MS }).toBe(true);
  await readTopics({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Summaries })}`, { headers: { cookie: owner.cookie } });
  await server.services.insights.worker.idle();
  const [topicsPrompt, summariesPrompt] = model.doGenerateCalls.map((call) => JSON.stringify(call.prompt));
  expect(topicsPrompt).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
  expect(summariesPrompt).toContain('Ana &lt;script&gt;');
  expect([topicsPrompt, summariesPrompt].every((prompt) => !prompt!.includes('@example.com'))).toBe(true);
  [client, editorClient].forEach((connected) => connected.close());
  await server.stop();
});

test('the key never reaches a log or a response', { timeout: 60_000 }, async () => {
  const failing = createServer((_, response) => {
    response.statusCode = SERVER_ERROR_STATUS;
    response.end('{"error":"boom"}');
  });
  await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve));
  const { port } = failing.address() as AddressInfo;
  const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
  const languageModel = chooseLanguageModel({ model: 'm', apiKey: SECRET, baseUrl: `http://127.0.0.1:${port}` });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel, texts: ['Budget up'] });
  const topics = await readTopics({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  const refreshed = await fetch(`${server.baseUrl}${topicsRefreshApiPath(documentId)}`, { method: 'POST', headers: { cookie: owner.cookie, origin: server.baseUrl } });
  await server.services.insights.worker.idle();
  const summaries = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Summaries })}`, { headers: { cookie: owner.cookie } });
  await server.services.insights.worker.idle();
  const bodies = [JSON.stringify(await readTopics({ server, documentId, cookie: owner.cookie })), JSON.stringify(topics), await refreshed.text(), await summaries.text()];
  const lines = logged.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)));
  expect([...bodies, ...lines].some((text) => text.includes(SECRET))).toBe(false);
  client.close();
  await server.stop();
  failing.close();
});

test('five new unassigned blocks trigger a recompute once', async () => {
  const model = modelAnswering(topicsAnswer(['b0']), topicsAnswer(['b0']));
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  const added = Array.from({ length: TOPIC_RECOMPUTE_NEW_BLOCKS }, (_, index) => `Extra ${index}`);
  writeStory({ document: client.document, texts: ['Budget up ', ...added] });
  await expect.poll(async () => (await readTimeline({ server, documentId, cookie: owner.cookie })).bands.length, { timeout: POLL_TIMEOUT_MS }).toBe(2);
  expect(model.doGenerateCalls).toHaveLength(1);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + TOPIC_RECOMPUTE_MIN_INTERVAL_MS + 1);
  await readTimeline({ server, documentId, cookie: owner.cookie });
  await readTimeline({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(2);
  vi.useRealTimers();
  client.close();
  await server.stop();
});
