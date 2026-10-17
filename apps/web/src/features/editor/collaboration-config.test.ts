import { expect, test } from 'vitest';
import { collaborationUrl, creatorTicketOf } from './collaboration-config';

const COLLABORATION_PATH = '/collaboration';
const ORIGIN_URL = `ws://localhost:3000${COLLABORATION_PATH}`;
const TICKET = { attempt: 2, epoch: 'epoch-1' };

test('the socket url carries the creator ticket as the attempt and epoch queries', () => {
  expect(collaborationUrl({ path: COLLABORATION_PATH, creatorTicket: TICKET })).toBe(`${ORIGIN_URL}?attempt=2&epoch=epoch-1`);
});

test('the socket url has no query without a ticket', () => {
  expect(collaborationUrl({ path: COLLABORATION_PATH, creatorTicket: null })).toBe(ORIGIN_URL);
});

test.each([
  { creatorAttempt: 2, creatorEpoch: 'epoch-1', ticket: TICKET },
  { creatorAttempt: null, creatorEpoch: null, ticket: null },
])('an open answer with attempt $creatorAttempt yields the ticket $ticket', ({ creatorAttempt, creatorEpoch, ticket }) => {
  expect(creatorTicketOf({ creatorAttempt, creatorEpoch })).toEqual(ticket);
});
