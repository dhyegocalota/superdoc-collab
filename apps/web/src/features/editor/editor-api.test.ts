import { DOCUMENT_NOT_READY_ERROR, HttpStatus } from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { DocumentUnavailableError } from '@/lib/api';
import { DocumentNotReadyError, openDocument } from './editor-api';

afterEach(() => vi.restoreAllMocks());

test('a 409 NOT_READY throws DocumentNotReadyError, not a generic error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { error: DOCUMENT_NOT_READY_ERROR }, status: HttpStatus.Conflict }));
  const failure = await openDocument(DOCUMENT_ID).catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(DocumentNotReadyError);
});

test('a 403 throws DocumentUnavailableError, so it never offers a retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status: HttpStatus.Forbidden }));
  const failure = await openDocument(DOCUMENT_ID).catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(DocumentUnavailableError);
});
