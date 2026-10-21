import { ClientActor, SELECTION_SUMMARY_FAILED_MESSAGE, TOPICS_INTERRUPTED_MESSAGE, TopicState } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { documentWithOwner } from '../testing/collaboration-client';

const SELECTION_KEY = 'a'.repeat(64);
const SENTENCE = 'Ana raised the budget.';
const OTHER_SELECTION_KEY = 'b'.repeat(64);
const THIRD_SELECTION_KEY = 'c'.repeat(64);
const FIRST_SAVED_AT = 1_800_000_000_000;
const SECOND_SAVED_AT = FIRST_SAVED_AT + 1000;
const THIRD_SAVED_AT = SECOND_SAVED_AT + 1000;
const FOURTH_SAVED_AT = THIRD_SAVED_AT + 1000;

afterEach(() => vi.useRealTimers());

test('a recompute keeps reused topic ids with their summaries and drops the rest', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  insights.saveTopics({
    documentId,
    topics: [
      { id: null, name: 'Budget', blockIds: ['b1', 'b2'] },
      { id: null, name: 'Hiring', blockIds: ['b3'] },
    ],
    computedAtSequence: 10,
  });
  const [budget, hiring] = insights.topics(documentId);
  insights.saveSummaries({
    summaries: [
      { topicId: budget!.id, sentence: 'Costs rose.' },
      { topicId: hiring!.id, sentence: 'Two hires.' },
    ],
    computedAtSequence: 10,
  });
  insights.saveTopics({
    documentId,
    topics: [
      { id: budget!.id, name: 'Costs', blockIds: ['b1', 'b2', 'b4'] },
      { id: null, name: 'Scope', blockIds: ['b5'] },
    ],
    computedAtSequence: 20,
  });
  expect(insights.topics(documentId).map((topic) => [topic.id === budget!.id, topic.name, topic.blockIds])).toEqual([
    [true, 'Costs', ['b1', 'b2', 'b4']],
    [false, 'Scope', ['b5']],
  ]);
  expect(insights.summaries(documentId).map((summary) => summary.sentence)).toEqual(['Costs rose.']);
  expect(insights.status(documentId)).toEqual({ state: TopicState.Ready, failure: null, computedAtSequence: 20 });
  await server.stop();
});

test('failInterrupted turns every pending set into failed', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  const readyDocumentId = randomUUID();
  server.services.documents.create({ id: readyDocumentId, title: 'Ready', ownerUserId: owner.id });
  insights.markPending(documentId);
  insights.saveTopics({ documentId: readyDocumentId, topics: [{ id: null, name: 'Budget', blockIds: ['b1'] }], computedAtSequence: 5 });
  insights.failInterrupted(TOPICS_INTERRUPTED_MESSAGE);
  expect(insights.status(documentId)).toMatchObject({ state: TopicState.Failed, failure: TOPICS_INTERRUPTED_MESSAGE });
  expect(insights.status(readyDocumentId)).toMatchObject({ state: TopicState.Ready, failure: null });
  await server.stop();
});

test('markPending and markFailed keep the stored topics', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  insights.saveTopics({ documentId, topics: [{ id: null, name: 'Budget', blockIds: ['b1'] }], computedAtSequence: 3 });
  const stored = insights.topics(documentId);
  insights.markPending(documentId);
  expect(insights.status(documentId)).toMatchObject({ state: TopicState.Pending });
  expect(insights.topics(documentId)).toEqual(stored);
  insights.markFailed({ documentId, failure: 'x' });
  expect(insights.status(documentId)).toMatchObject({ state: TopicState.Failed, failure: 'x' });
  expect(insights.topics(documentId)).toEqual(stored);
  await server.stop();
});

test('markPending on a document without topics creates a pending set', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  expect(insights.status(documentId)).toBeNull();
  insights.markPending(documentId);
  expect(insights.status(documentId)).toEqual({ state: TopicState.Pending, failure: null, computedAtSequence: null });
  await server.stop();
});

test('deleting the document cascades every insights row', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  insights.saveTopics({ documentId, topics: [{ id: null, name: 'Budget', blockIds: ['b1'] }], computedAtSequence: 3 });
  const [budget] = insights.topics(documentId);
  insights.saveSummaries({ summaries: [{ topicId: budget!.id, sentence: 'Costs rose.' }], computedAtSequence: 3 });
  server.services.documents.remove(documentId);
  expect(insights.status(documentId)).toBeNull();
  expect(insights.topics(documentId)).toEqual([]);
  expect(insights.summaries(documentId)).toEqual([]);
  expect(server.database.sqlite.prepare('SELECT COUNT(*) AS total FROM topic_blocks').get()).toEqual({ total: 0 });
  await server.stop();
});

test('a topic id from another document is saved as a new topic and leaves the other untouched', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  const otherDocumentId = randomUUID();
  server.services.documents.create({ id: otherDocumentId, title: 'Other', ownerUserId: owner.id });
  insights.saveTopics({ documentId: otherDocumentId, topics: [{ id: null, name: 'Hiring', blockIds: ['b9'] }], computedAtSequence: 1 });
  const [foreign] = insights.topics(otherDocumentId);
  insights.saveTopics({ documentId, topics: [{ id: foreign!.id, name: 'Budget', blockIds: ['b1'] }], computedAtSequence: 2 });
  expect(insights.topics(documentId).map((topic) => [topic.id === foreign!.id, topic.name])).toEqual([[false, 'Budget']]);
  expect(insights.topics(otherDocumentId).map((topic) => [topic.id, topic.name, topic.blockIds])).toEqual([
    [foreign!.id, 'Hiring', ['b9']],
  ]);
  await server.stop();
});

test('a selection summary is saved and read back, and a later failure keeps its sentence and stamp', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  expect(insights.selectionSummary({ documentId, key: SELECTION_KEY })).toBeNull();
  insights.saveSelectionSummary({
    documentId,
    key: SELECTION_KEY,
    sentence: SENTENCE,
    authors: [{ name: 'Ana', actor: ClientActor.Human }],
    computedAtSequence: 7,
    topicsUpdatedAt: null,
  });
  expect(insights.selectionSummary({ documentId, key: SELECTION_KEY })).toEqual({
    key: SELECTION_KEY,
    sentence: SENTENCE,
    authors: [{ name: 'Ana', actor: ClientActor.Human }],
    failure: null,
    computedAtSequence: 7,
    topicsUpdatedAt: null,
  });
  insights.saveSelectionFailure({
    documentId,
    key: SELECTION_KEY,
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
    computedAtSequence: 9,
    topicsUpdatedAt: 5,
  });
  expect(insights.selectionSummary({ documentId, key: SELECTION_KEY })).toEqual({
    key: SELECTION_KEY,
    sentence: SENTENCE,
    authors: [{ name: 'Ana', actor: ClientActor.Human }],
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
    computedAtSequence: 7,
    topicsUpdatedAt: null,
  });
  insights.saveSelectionSummary({
    documentId,
    key: SELECTION_KEY,
    sentence: 'Ana and Bruno changed the plan.',
    authors: [
      { name: 'Ana', actor: ClientActor.Human },
      { name: 'Bruno', actor: ClientActor.Human },
    ],
    computedAtSequence: 9,
    topicsUpdatedAt: 5,
  });
  expect(insights.selectionSummary({ documentId, key: SELECTION_KEY })).toMatchObject({
    failure: null,
    authors: [
      { name: 'Ana', actor: ClientActor.Human },
      { name: 'Bruno', actor: ClientActor.Human },
    ],
    computedAtSequence: 9,
    topicsUpdatedAt: 5,
  });
  await server.stop();
});

test('a first attempt that fails is stored without a sentence', async () => {
  const { server, documentId } = await documentWithOwner();
  server.services.insightsRepository.saveSelectionFailure({
    documentId,
    key: SELECTION_KEY,
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
    computedAtSequence: 3,
    topicsUpdatedAt: null,
  });
  expect(server.services.insightsRepository.selectionSummary({ documentId, key: SELECTION_KEY })).toEqual({
    key: SELECTION_KEY,
    sentence: null,
    authors: [],
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
    computedAtSequence: 3,
    topicsUpdatedAt: null,
  });
  await server.stop();
});

test('selection summaries are deleted with their document', async () => {
  const { server, documentId } = await documentWithOwner();
  server.services.insightsRepository.saveSelectionSummary({
    documentId,
    key: SELECTION_KEY,
    sentence: SENTENCE,
    authors: [],
    computedAtSequence: 1,
    topicsUpdatedAt: null,
  });
  server.services.documents.remove(documentId);
  expect(server.services.insightsRepository.selectionSummary({ documentId, key: SELECTION_KEY })).toBeNull();
  await server.stop();
});

test('the latest selection summary is the newest stored sentence of any filter and skips a failure with no sentence', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  const stamp = { documentId, computedAtSequence: 7, topicsUpdatedAt: null };
  const authors = [{ name: 'Ana', actor: ClientActor.Human }];
  expect(insights.latestSelectionSummary(documentId)).toBeNull();
  vi.setSystemTime(FIRST_SAVED_AT);
  insights.saveSelectionSummary({ ...stamp, key: SELECTION_KEY, sentence: 'First.', authors });
  vi.setSystemTime(SECOND_SAVED_AT);
  insights.saveSelectionSummary({ ...stamp, key: OTHER_SELECTION_KEY, sentence: 'Second.', authors, computedAtSequence: 9 });
  vi.setSystemTime(THIRD_SAVED_AT);
  insights.saveSelectionFailure({ ...stamp, key: THIRD_SELECTION_KEY, failure: SELECTION_SUMMARY_FAILED_MESSAGE });
  expect(insights.latestSelectionSummary(documentId)).toEqual({
    sentence: 'Second.',
    authors,
    computedAtSequence: 9,
    updatedAt: SECOND_SAVED_AT,
  });
  vi.setSystemTime(FOURTH_SAVED_AT);
  insights.saveSelectionSummary({ ...stamp, key: SELECTION_KEY, sentence: 'First again.', authors });
  expect(insights.latestSelectionSummary(documentId)).toMatchObject({ sentence: 'First again.', updatedAt: FOURTH_SAVED_AT });
  await server.stop();
});

test('a document with only a failed selection has no latest summary', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  insights.saveSelectionFailure({
    documentId,
    key: SELECTION_KEY,
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
    computedAtSequence: 1,
    topicsUpdatedAt: null,
  });
  expect(insights.latestSelectionSummary(documentId)).toBeNull();
  await server.stop();
});
