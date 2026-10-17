import type { HttpMethod } from '@superdoc-history/types';

const JSON_CONTENT_TYPE = 'application/json';

export class ApiRequestError extends Error {}

export class DocumentUnavailableError extends ApiRequestError {}

export function requestFailedMessage({ subject, status }: { subject: string; status: number }): string {
  return `${subject} failed with status ${status}.`;
}

export class RetryLaterError extends ApiRequestError {
  readonly retryAfterMs: number;

  constructor({ message, retryAfterMs }: { message: string; retryAfterMs: number }) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

export function apiGet(path: string): Promise<Response> {
  return fetch(path, { credentials: 'same-origin' });
}

export function apiSend({ path, method, body }: { path: string; method: HttpMethod; body: BodyInit | null }): Promise<Response> {
  const headers = typeof body === 'string' ? { 'content-type': JSON_CONTENT_TYPE } : undefined;
  return fetch(path, { method, body, headers, credentials: 'same-origin' });
}

export function assertDocumentAvailable(response: Response): void {}

export function assertOk({ response, subject }: { response: Response; subject: string }): void {}

export function readJson<Body>({ response, subject }: { response: Response; subject: string }): Promise<Body> {
  return response.json();
}
