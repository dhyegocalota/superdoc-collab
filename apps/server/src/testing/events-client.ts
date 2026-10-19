import {
  documentApiPath,
  DocumentResource,
  TimelineQueryParam,
  type DocumentEditEvent,
  type DocumentEditEvents,
} from '@superdoc-collab/types';
import type { TestServer } from './test-server';

class TestRequestFailedError extends Error {
  constructor({ path, status }: { path: string; status: number }) {
    super(`Test request to ${path} failed with status ${status}.`);
  }
}

async function readEventsAfter({
  server,
  documentId,
  cookie,
  afterSequence,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
  afterSequence: number | null;
}): Promise<DocumentEditEvent[]> {
  const query = afterSequence === null ? '' : `?${TimelineQueryParam.AfterSequence}=${afterSequence}`;
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Events })}${query}`, {
    headers: { cookie },
  });
  if (!response.ok) throw new TestRequestFailedError({ path: DocumentResource.Events, status: response.status });
  const body: DocumentEditEvents = await response.json();
  if (body.nextAfterSequence === null) return body.events;
  return [...body.events, ...(await readEventsAfter({ server, documentId, cookie, afterSequence: body.nextAfterSequence }))];
}

export function readEvents({
  server,
  documentId,
  cookie,
}: {
  server: TestServer;
  documentId: string;
  cookie: string;
}): Promise<DocumentEditEvent[]> {
  return readEventsAfter({ server, documentId, cookie, afterSequence: null });
}

export function insertedBy({ events, userId }: { events: DocumentEditEvent[]; userId: string }): string {
  return events
    .filter((event) => event.authors.length === 1 && event.authors[0]?.id === userId)
    .map((event) => event.inserted)
    .join('');
}
