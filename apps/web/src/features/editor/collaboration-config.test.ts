import { CREATOR_ATTEMPT_QUERY_KEY, CREATOR_EPOCH_QUERY_KEY, TAB_QUERY_KEY } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { tabId } from '@/lib/tab-id';
import { collaborationUrl, creatorTicketOf } from './collaboration-config';

const COLLABORATION_PATH = '/collaboration';
const TICKET = { attempt: 2, epoch: 'epoch-1' };

test('the collaboration URL carries the tab id as the tab query', () => {
  const url = new URL(collaborationUrl({ path: COLLABORATION_PATH, creatorTicket: null }));
  expect(url.pathname).toBe(COLLABORATION_PATH);
  expect(url.searchParams.get(TAB_QUERY_KEY)).toBe(tabId());
});

test('the socket url carries the tab id and the creator ticket as the attempt and epoch queries', () => {
  const url = new URL(collaborationUrl({ path: COLLABORATION_PATH, creatorTicket: TICKET }));
  expect(url.searchParams.get(TAB_QUERY_KEY)).toBe(tabId());
  expect(url.searchParams.get(CREATOR_ATTEMPT_QUERY_KEY)).toBe('2');
  expect(url.searchParams.get(CREATOR_EPOCH_QUERY_KEY)).toBe('epoch-1');
});

test('the socket url has no ticket queries without a ticket', () => {
  const url = new URL(collaborationUrl({ path: COLLABORATION_PATH, creatorTicket: null }));
  expect(url.searchParams.has(CREATOR_ATTEMPT_QUERY_KEY)).toBe(false);
  expect(url.searchParams.has(CREATOR_EPOCH_QUERY_KEY)).toBe(false);
});

test.each([
  { creatorAttempt: 2, creatorEpoch: 'epoch-1', ticket: TICKET },
  { creatorAttempt: null, creatorEpoch: null, ticket: null },
])('an open answer with attempt $creatorAttempt yields the ticket $ticket', ({ creatorAttempt, creatorEpoch, ticket }) => {
  expect(creatorTicketOf({ creatorAttempt, creatorEpoch })).toEqual(ticket);
});
