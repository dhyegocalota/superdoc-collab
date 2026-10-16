import type { HttpMethod } from '@superdoc-history/types';

const JSON_CONTENT_TYPE = 'application/json';

export class ApiRequestError extends Error {}

export function apiGet(path: string): Promise<Response> {
  return fetch(path, { credentials: 'same-origin' });
}

export function apiSend({ path, method, body }: { path: string; method: HttpMethod; body: BodyInit | null }): Promise<Response> {
  const headers = typeof body === 'string' ? { 'content-type': JSON_CONTENT_TYPE } : undefined;
  return fetch(path, { method, body, headers, credentials: 'same-origin' });
}
