import { TOPICS_INTERRUPTED_MESSAGE, TopicState } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { documentWithOwner } from '../testing/collaboration-client';

test('a recompute keeps reused topic ids with their summaries and drops the rest', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  insights.saveTopics({ documentId, topics: [{ id: null, name: 'Budget', blockIds: ['b1', 'b2'] }, { id: null, name: 'Hiring', blockIds: ['b3'] }], computedAtSequence: 10 });
  const [budget, hiring] = insights.topics(documentId);
  insights.saveSummaries({ summaries: [{ topicId: budget!.id, sentence: 'Costs rose.' }, { topicId: hiring!.id, sentence: 'Two hires.' }], computedAtSequence: 10 });
  insights.saveTopics({ documentId, topics: [{ id: budget!.id, name: 'Costs', blockIds: ['b1', 'b2', 'b4'] }, { id: null, name: 'Scope', blockIds: ['b5'] }], computedAtSequence: 20 });
  expect(insights.topics(documentId).map((topic) => [topic.id === budget!.id, topic.name, topic.blockIds])).toEqual([[true, 'Costs', ['b1', 'b2', 'b4']], [false, 'Scope', ['b5']]]);
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
