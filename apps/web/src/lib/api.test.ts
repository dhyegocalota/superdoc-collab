import { DOCUMENT_UNAVAILABLE_MESSAGE, HttpStatus } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import {
  ApiRequestError,
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
