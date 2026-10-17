import { DOCUMENT_NOT_READY_ERROR, documentApiPath, HttpStatus } from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { DocumentNotReadyError, openDocument } from './editor-api';

afterEach(() => vi.restoreAllMocks());

test('a 409 NOT_READY throws DocumentNotReadyError, not a generic error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { error: DOCUMENT_NOT_READY_ERROR }, status: HttpStatus.Conflict }));
  const failure = await openDocument(DOCUMENT_ID).catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(DocumentNotReadyError);
});

test('the open request targets the document path', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status: HttpStatus.Ok }));
  await openDocument(DOCUMENT_ID);
  expect(fetchSpy).toHaveBeenCalledWith(documentApiPath({ documentId: DOCUMENT_ID }), expect.anything());
});
