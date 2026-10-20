import { DOCUMENT_UNAVAILABLE_MESSAGE, HttpStatus, type HttpMethod } from '@superdoc-collab/types';

const JSON_CONTENT_TYPE = 'application/json';
const NETWORK_FAILURE_MESSAGE = 'Failed to fetch';

export class ApiRequestError extends Error {}

export class DocumentUnavailableError extends ApiRequestError {}

export class AuthenticationError extends ApiRequestError {}

export class ServerBusyError extends ApiRequestError {}

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

export async function refusalMessageOf({ response, fallback }: { response: Response; fallback: string }): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (typeof body?.error !== 'string') return fallback;
  return body.error;
}

export function apiGet(path: string): Promise<Response> {
  return fetch(path, { credentials: 'same-origin' });
}

export function apiGetWithHeaders({ path, headers }: { path: string; headers: Record<string, string> }): Promise<Response> {
  return fetch(path, { credentials: 'same-origin', headers });
}

export function apiSend({ path, method, body }: { path: string; method: HttpMethod; body: BodyInit | null }): Promise<Response> {
  const headers = typeof body === 'string' ? { 'content-type': JSON_CONTENT_TYPE } : undefined;
  return fetch(path, { method, body, headers, credentials: 'same-origin' });
}

export type UploadProgress = { sentBytes: number; totalBytes: number };

export function apiSendWithProgress({
  path,
  method,
  body,
  onProgress,
}: {
  path: string;
  method: HttpMethod;
  body: FormData;
  onProgress: (progress: UploadProgress) => void;
}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, path);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress({ sentBytes: event.loaded, totalBytes: event.total });
    };
    request.onload = () => resolve(new Response(request.responseText === '' ? null : request.responseText, { status: request.status }));
    request.onerror = () => reject(new TypeError(NETWORK_FAILURE_MESSAGE));
    request.send(body);
  });
}

export function assertDocumentAvailable(response: Response): void {
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
}

export function assertOk({ response, subject }: { response: Response; subject: string }): void {
  if (response.ok) return;
  const message = requestFailedMessage({ subject, status: response.status });
  if (response.status === HttpStatus.Unauthorized) throw new AuthenticationError(message);
  throw new ApiRequestError(message);
}

export async function readJson<Body>({ response, subject }: { response: Response; subject: string }): Promise<Body> {
  assertOk({ response, subject });
  return response.json();
}

type PolledQuery = { state: { error: Error | null } };

export function pollWhileAvailable(intervalMs: number): (query: PolledQuery) => number | false {
  return function pollUnlessUnavailable(query: PolledQuery): number | false {
    if (query.state.error instanceof DocumentUnavailableError) return false;
    if (query.state.error instanceof AuthenticationError) return false;
    return intervalMs;
  };
}
