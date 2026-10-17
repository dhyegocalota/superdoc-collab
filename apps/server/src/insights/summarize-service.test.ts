import { writeStory } from '@superdoc-collab/history/testing';
import {
  SelectionSummaryState,
  SUMMARIZE_COOLDOWN_MS,
  SummarizeStep,
  TOPICS_FAILED_MESSAGE,
  TopicState,
  UTC_TIME_ZONE,
} from '@superdoc-collab/types';
import type { MockLanguageModelV4 } from 'ai/test';
import { afterEach, expect, test, vi } from 'vitest';
import { readEvents } from '../testing/events-client';
import { failingModel, gatedModel, modelAnsweringWith, readyModel } from '../testing/language-model';
import { storyWithBlocks } from '../testing/timeline-client';
import { SELECTION_SYSTEM_PROMPT, SUMMARIES_SYSTEM_PROMPT, TOPICS_SYSTEM_PROMPT } from './prompts';
import type { RequestedSelection } from './selection-summaries-service';
import { SummarizeOutcome, SummarizeService } from './summarize-service';

enum ModelCall {
  Topics = 'topics',
  Summary = 'summary',
  Sentences = 'sentences',
}

const POLL_TIMEOUT_MS = 15_000;
const SELECTION: RequestedSelection = { term: null, author: null, topic: null, at: null, binMs: null, timeZone: UTC_TIME_ZONE };
const TOPICS = [
  { name: 'Budget', blockIds: ['b0'] },
  { name: 'Hiring', blockIds: ['b1'] },
];
const COMBINED_ANSWER = { topics: TOPICS, sentence: 'Budget and hiring grew.', authors: [], summaries: [] };
const MODEL_CALL_BY_SYSTEM_PROMPT: Record<string, ModelCall> = {
  [TOPICS_SYSTEM_PROMPT]: ModelCall.Topics,
  [SELECTION_SYSTEM_PROMPT]: ModelCall.Summary,
  [SUMMARIES_SYSTEM_PROMPT]: ModelCall.Sentences,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function modelCallsOf(model: MockLanguageModelV4): ModelCall[] {
  return model.doGenerateCalls.map(
    (call) => MODEL_CALL_BY_SYSTEM_PROMPT[call.prompt.find((message) => message.role === 'system')!.content]!,
  );
}

async function documentWithTopics({ isFresh, modelFor }: { isFresh: boolean; modelFor: (answer: () => unknown) => MockLanguageModelV4 }) {
  const current: { topicSentences: () => { topicId: string; sentence: string }[] } = { topicSentences: () => [] };
  const model = modelFor(() => ({ ...COMBINED_ANSWER, summaries: current.topicSentences() }));
  const story = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget', 'Hiring'] });
  const { server, documentId, owner, client } = story;
  const { insightsRepository } = server.services;
  current.topicSentences = () =>
    insightsRepository.topics(documentId).map((topic) => ({ topicId: topic.id, sentence: `About ${topic.name}.` }));
  writeStory({ document: client.document, texts: ['Budget up', 'Hiring up'] });
  await expect
    .poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted), {
      timeout: POLL_TIMEOUT_MS,
    })
    .toEqual(expect.arrayContaining([' up']));
  const { sequence } = await server.services.scheduler.blocks(documentId);
  insightsRepository.saveTopics({
    documentId,
    topics: TOPICS.map((topic) => ({ id: null, ...topic })),
    computedAtSequence: isFresh ? sequence : 1,
  });
  const { topics, summaries, selection, jobRunner } = server.services.insights;
  return { ...story, model, summarize: new SummarizeService({ topics, summaries, selection, jobRunner }) };
}

test('makes no model call when topics, summary and sentences are fresh', async () => {
  const { server, documentId, client, model, summarize } = await documentWithTopics({ isFresh: false, modelFor: modelAnsweringWith });
  expect(summarize.request({ documentId, selection: SELECTION }).outcome).toBe(SummarizeOutcome.Started);
  await server.services.insights.jobRunner.idle();
  const callsAfterFirstRun = model.doGenerateCalls.length;
  const second = summarize.request({ documentId, selection: SELECTION });
  expect(second.outcome).toBe(SummarizeOutcome.UpToDate);
  expect(model.doGenerateCalls.length - callsAfterFirstRun).toBe(0);
  expect(server.services.insights.selection.read({ documentId, selection: SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    step: SummarizeStep.Idle,
  });
  client.close();
  await server.stop();
});

test('regroups only when topics failed or are older than the newest edit, then summarizes, then rewrites stale sentences', async () => {
  const { server, documentId, client, model, summarize } = await documentWithTopics({ isFresh: false, modelFor: modelAnsweringWith });
  summarize.request({ documentId, selection: SELECTION });
  await server.services.insights.jobRunner.idle();
  expect(modelCallsOf(model)).toEqual([ModelCall.Topics, ModelCall.Summary, ModelCall.Sentences]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + SUMMARIZE_COOLDOWN_MS);
  server.services.insightsRepository.markFailed({ documentId, failure: TOPICS_FAILED_MESSAGE });
  summarize.request({ documentId, selection: SELECTION });
  await server.services.insights.jobRunner.idle();
  expect(modelCallsOf(model).slice(3)).toEqual([ModelCall.Topics, ModelCall.Summary]);
  client.close();
  await server.stop();
});

test('fresh topics are not regrouped', async () => {
  const { server, documentId, client, model, summarize } = await documentWithTopics({ isFresh: true, modelFor: modelAnsweringWith });
  summarize.request({ documentId, selection: SELECTION });
  await server.services.insights.jobRunner.idle();
  expect(modelCallsOf(model)).toEqual([ModelCall.Summary, ModelCall.Sentences]);
  client.close();
  await server.stop();
});

test('a failed regroup keeps the previous ready topics', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, client, summarize } = await documentWithTopics({
    isFresh: false,
    modelFor: () => failingModel(new Error('provider exploded')),
  });
  const before = server.services.insightsRepository.topics(documentId);
  summarize.request({ documentId, selection: SELECTION });
  await server.services.insights.jobRunner.idle();
  expect(server.services.insightsRepository.topics(documentId)).toEqual(before);
  expect(server.services.insightsRepository.status(documentId)).toMatchObject({
    state: TopicState.Failed,
    failure: TOPICS_FAILED_MESSAGE,
  });
  client.close();
  await server.stop();
});

test('reports the step while the job runs and returns to idle when it ends', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { server, documentId, client, summarize } = await documentWithTopics({
    isFresh: false,
    modelFor: () => gatedModel({ gate, answer: COMBINED_ANSWER }),
  });
  const { selection } = server.services.insights;
  expect(selection.read({ documentId, selection: SELECTION }).step).toBe(SummarizeStep.Idle);
  summarize.request({ documentId, selection: SELECTION });
  expect(selection.read({ documentId, selection: SELECTION })).toMatchObject({
    state: SelectionSummaryState.Running,
    step: SummarizeStep.Grouping,
  });
  release();
  await server.services.insights.jobRunner.idle();
  expect(selection.read({ documentId, selection: SELECTION }).step).toBe(SummarizeStep.Idle);
  client.close();
  await server.stop();
});

test('the step returns to idle when the job fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, client, summarize } = await documentWithTopics({
    isFresh: false,
    modelFor: () => failingModel(new Error('provider exploded')),
  });
  summarize.request({ documentId, selection: SELECTION });
  await server.services.insights.jobRunner.idle();
  expect(server.services.insights.selection.read({ documentId, selection: SELECTION }).step).toBe(SummarizeStep.Idle);
  client.close();
  await server.stop();
});

test('a second request while the job runs is already running and spends no second call', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { server, documentId, client, model, summarize } = await documentWithTopics({
    isFresh: false,
    modelFor: () => gatedModel({ gate, answer: COMBINED_ANSWER }),
  });
  summarize.request({ documentId, selection: SELECTION });
  expect(summarize.request({ documentId, selection: SELECTION }).outcome).toBe(SummarizeOutcome.AlreadyRunning);
  release();
  await server.services.insights.jobRunner.idle();
  expect(modelCallsOf(model).filter((call) => call === ModelCall.Topics)).toHaveLength(1);
  client.close();
  await server.stop();
});
