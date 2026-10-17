import { DOCUMENT_UNAVAILABLE_MESSAGE, HttpStatus, type HttpMethod } from '@superdoc-collab/types';

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

export function assertDocumentAvailable(response: Response): void {
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
}

export function assertOk({ response, subject }: { response: Response; subject: string }): void {
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject, status: response.status }));
}

export async function readJson<Body>({ response, subject }: { response: Response; subject: string }): Promise<Body> {
  assertOk({ response, subject });
  return response.json();
}

type PolledQuery = { state: { error: Error | null } };

export function pollWhileAvailable(intervalMs: number): (query: PolledQuery) => number | false {
  return function pollUnlessUnavailable(query: PolledQuery): number | false {
    if (query.state.error instanceof DocumentUnavailableError) return false;
    return intervalMs;
  };
}
