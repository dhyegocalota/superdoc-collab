import { documentApiPath, DocumentResource, type DocumentEditEvent, type DocumentEditEvents } from '@superdoc-history/types';
import type { TestServer } from './test-server';

export class TestRequestFailedError extends Error {
  constructor({ path, status }: { path: string; status: number }) {
    super(`Test request to ${path} failed with status ${status}.`);
  }
}

export async function readEvents({ server, documentId, cookie }: { server: TestServer; documentId: string; cookie: string }): Promise<DocumentEditEvent[]> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Events })}`, { headers: { cookie } });
  if (!response.ok) throw new TestRequestFailedError({ path: DocumentResource.Events, status: response.status });
  const body: DocumentEditEvents = await response.json();
  return body.events;
}

export function insertedBy({ events, userId }: { events: DocumentEditEvent[]; userId: string }): string {
  return events.filter((event) => event.authors.length === 1 && event.authors[0]?.id === userId).map((event) => event.inserted).join('');
}
