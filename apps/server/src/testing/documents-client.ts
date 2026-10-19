import { documentApiPath, HttpMethod, type DocumentResource, type OpenedDocument } from '@superdoc-collab/types';
import type { TestServer, TestUser } from './test-server';

const JSON_HEADERS = { 'content-type': 'application/json' };

export function request({
  server,
  cookie,
  path,
  method = HttpMethod.Get,
  body,
}: {
  server: TestServer;
  cookie: string;
  path: string;
  method?: HttpMethod;
  body?: unknown;
}): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { cookie, ...JSON_HEADERS },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function pathOf({ documentId, resource }: { documentId: string; resource?: DocumentResource }): string {
  return documentApiPath({ documentId, resource });
}

export async function openedBy({
  server,
  user,
  documentId,
}: {
  server: TestServer;
  user: TestUser;
  documentId: string;
}): Promise<OpenedDocument> {
  return (await request({ server, cookie: user.cookie, path: pathOf({ documentId }) })).json();
}
