import { DOCUMENT_UNAVAILABLE_MESSAGE, HttpMethod, HttpStatus } from '@superdoc-collab/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { latestUploadRequest, stubUploadRequests, restoreUploadRequests } from '@/testing/fake-upload-request';
import { jsonResponse } from '@/testing/json-response';
import {
  ApiRequestError,
  AuthenticationError,
  apiSendWithProgress,
  assertDocumentAvailable,
  assertOk,
  DocumentUnavailableError,
  pollWhileAvailable,
  readJson,
  requestFailedMessage,
} from './api';

const SUBJECT = 'Members request';
const BODY = { members: [] };
const INTERVAL_MS = 5000;

test('readJson returns the body of a successful response', async () => {
  await expect(readJson({ response: jsonResponse({ body: BODY }), subject: SUBJECT })).resolves.toEqual(BODY);
});

test('readJson names the subject and the status of a failed response', async () => {
  const failure = readJson({ response: new Response(null, { status: HttpStatus.Forbidden }), subject: SUBJECT });
  await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
  await expect(failure).rejects.toEqual(new ApiRequestError(requestFailedMessage({ subject: SUBJECT, status: HttpStatus.Forbidden })));
});

test('assertOk lets a successful response through and refuses a failed one', () => {
  expect(() => assertOk({ response: new Response(null, { status: HttpStatus.NoContent }), subject: SUBJECT })).not.toThrow();
  expect(() => assertOk({ response: new Response(null, { status: HttpStatus.InternalServerError }), subject: SUBJECT })).toThrow(
    requestFailedMessage({ subject: SUBJECT, status: HttpStatus.InternalServerError }),
  );
});

test('a 404 means the document is unavailable', () => {
  const unavailable = new Response(null, { status: HttpStatus.NotFound });
  expect(() => assertDocumentAvailable(unavailable)).toThrow(DocumentUnavailableError);
  expect(() => assertDocumentAvailable(unavailable)).toThrow(new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE));
  expect(() => assertDocumentAvailable(new Response(null, { status: HttpStatus.Forbidden }))).not.toThrow();
});

test('polling continues at its interval until the document is gone', () => {
  const poll = pollWhileAvailable(INTERVAL_MS);
  expect(poll({ state: { error: null } })).toBe(INTERVAL_MS);
  expect(poll({ state: { error: new ApiRequestError('busy') } })).toBe(INTERVAL_MS);
  expect(poll({ state: { error: new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE) } })).toBe(false);
});

test('a 401 is an authentication error', () => {
  const failed = { response: new Response(null, { status: HttpStatus.Unauthorized }), subject: SUBJECT };
  expect(() => assertOk(failed)).toThrow(AuthenticationError);
  expect(() => assertOk(failed)).toThrow(requestFailedMessage({ subject: SUBJECT, status: HttpStatus.Unauthorized }));
});

test('polling stops once the session has ended', () => {
  const poll = pollWhileAvailable(INTERVAL_MS);
  expect(poll({ state: { error: new AuthenticationError('ended') } })).toBe(false);
});

describe('apiSendWithProgress', () => {
  beforeEach(stubUploadRequests);
  afterEach(() => restoreUploadRequests());

  function send(onProgress = vi.fn()) {
    const response = apiSendWithProgress({ path: '/upload', method: HttpMethod.Post, body: new FormData(), onProgress });
    return { response, onProgress, request: latestUploadRequest() };
  }

  test('it sends the method, the path and the body', () => {
    const body = new FormData();
    void apiSendWithProgress({ path: '/upload', method: HttpMethod.Post, body, onProgress: vi.fn() });
    const request = latestUploadRequest();
    expect([request.method, request.path, request.body]).toEqual([HttpMethod.Post, '/upload', body]);
  });

  test('it resolves a Response with the status and the body of the answer', async () => {
    const { response, request } = send();
    request.respond({ status: HttpStatus.Created, body: { id: 'doc-1' } });
    const answer = await response;
    expect(answer.status).toBe(HttpStatus.Created);
    expect(await answer.json()).toEqual({ id: 'doc-1' });
  });

  test('an answer with no body is a Response with no body', async () => {
    const { response, request } = send();
    request.respond({ status: HttpStatus.UnsupportedMediaType, body: null });
    const answer = await response;
    expect(answer.status).toBe(HttpStatus.UnsupportedMediaType);
    expect(answer.body).toBeNull();
  });

  test('it reports the bytes sent when the browser knows the total, and nothing otherwise', () => {
    const { onProgress, request } = send();
    request.reportProgress({ lengthComputable: false, loaded: 10, total: 0 });
    expect(onProgress).not.toHaveBeenCalled();
    request.reportProgress({ lengthComputable: true, loaded: 40, total: 100 });
    expect(onProgress).toHaveBeenCalledWith({ sentBytes: 40, totalBytes: 100 });
  });

  test('a connection failure rejects like fetch does', async () => {
    const { response, request } = send();
    request.failToConnect();
    await expect(response).rejects.toBeInstanceOf(TypeError);
  });
});
