import { DocumentRole, type TopicSummary } from '@superdoc-history/types';
import { writeStory } from '@superdoc-history/history/testing';
import type { MockLanguageModelV4 } from 'ai/test';
import { afterEach, expect, test, vi } from 'vitest';
import { memberWithRole } from '../testing/collaboration-client';
import { readEvents } from '../testing/events-client';
import { modelAnswering, modelAnsweringWith, readyModel } from '../testing/language-model';
import { readSummaries, storyWithBlocks } from '../testing/timeline-client';
import { LLM_MAX_CONCURRENT_JOBS } from '../config/environment';
import { SUMMARIES_BUSY_MESSAGE, SUMMARY_MIN_INTERVAL_MS } from './summaries-service';

const POLL_TIMEOUT_MS = 15_000;

afterEach(() => {
  vi.useRealTimers();
});

async function twoTopicDocument(): Promise<Awaited<ReturnType<typeof storyWithBlocks>> & { model: MockLanguageModelV4 }> {
  const stored: { topicId: string; sentence: string }[] = [];
  const model = modelAnsweringWith(() => ({ summaries: stored }));
  const story = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget', 'Hiring'] });
  const { server, documentId, owner, client } = story;
  writeStory({ document: client.document, texts: ['Budget up', 'Hiring up'] });
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted), {
      timeout: POLL_TIMEOUT_MS,
    })
    .toEqual(expect.arrayContaining([' up']));
  server.services.insightsRepository.saveTopics({
    documentId,
    topics: [
      { id: null, name: 'Budget', blockIds: ['b0'] },
      { id: null, name: 'Hiring', blockIds: ['b1'] },
    ],
    computedAtSequence: 1,
  });
  stored.push(
    ...server.services.insightsRepository.topics(documentId).map((topic) => ({ topicId: topic.id, sentence: `About ${topic.name}.` })),
  );
  return { ...story, model };
}

function sentencesOf(summaries: TopicSummary[]): string[] {
  return summaries.map((summary) => summary.sentence).sort();
}

test('a reader before any topic gets an empty list', async () => {
  const model = modelAnswering({ summaries: [] });
  const { server, documentId, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  expect(await readSummaries({ server, documentId, cookie: reader.cookie })).toEqual({ summaries: [] });
  expect(model.doGenerateCalls).toHaveLength(0);
  client.close();
  await server.stop();
});

test('one call summarizes every stale topic', async () => {
  const { server, documentId, owner, client, model } = await twoTopicDocument();
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  const topicIds = server.services.insightsRepository.topics(documentId).map((topic) => topic.id);
  topicIds.forEach((topicId) => expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(topicId));
  expect(sentencesOf((await readSummaries({ server, documentId, cookie: owner.cookie })).summaries)).toEqual([
    'About Budget.',
    'About Hiring.',
  ]);
  client.close();
  await server.stop();
});

test('a topic without new edits is not resummarized', async () => {
  const { server, documentId, owner, client, model } = await twoTopicDocument();
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  client.close();
  await server.stop();
});

test('a new edit inside the minimum interval waits', async () => {
  const { server, documentId, owner, client, model } = await twoTopicDocument();
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  writeStory({ document: client.document, texts: ['Budget up again', 'Hiring up'] });
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted), {
      timeout: POLL_TIMEOUT_MS,
    })
    .toEqual(expect.arrayContaining([' again']));
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + SUMMARY_MIN_INTERVAL_MS + 1);
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(2);
  vi.useRealTimers();
  client.close();
  await server.stop();
});

test('summaries are skipped and logged when the process-wide LLM cap is full', async () => {
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { server, documentId, owner, client, model } = await twoTopicDocument();
  let open: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  Array.from({ length: LLM_MAX_CONCURRENT_JOBS }).forEach((_, index) =>
    server.services.insights.worker.run({ key: `held-${index}`, job: () => held }),
  );
  await readSummaries({ server, documentId, cookie: owner.cookie });
  expect(model.doGenerateCalls).toHaveLength(0);
  await readSummaries({ server, documentId, cookie: owner.cookie });
  expect(warnings.mock.calls.filter(([line]) => String(line).startsWith(SUMMARIES_BUSY_MESSAGE))).toHaveLength(1);
  open();
  await server.services.insights.worker.idle();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + SUMMARY_MIN_INTERVAL_MS + 1);
  await readSummaries({ server, documentId, cookie: owner.cookie });
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  client.close();
  await server.stop();
});
