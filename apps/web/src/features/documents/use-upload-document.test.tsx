import {
  DocumentRole,
  DOCX_MIME_TYPE,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  NOT_A_DOCX_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
} from '@superdoc-collab/types';
import { act, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { DOCUMENTS_QUERY_KEY } from './documents-api';
import { ONE_FILE_AT_A_TIME_MESSAGE } from './documents-copy';
import { useUploadDocument } from './use-upload-document';

const UPLOADED_DOCUMENT = { id: 'doc-1', title: 'plan', owner: { id: 'user-1', name: 'Ada' }, updatedAt: 1, role: DocumentRole.Owner };

function docxFile({ name, size }: { name: string; size: number }): File {
  return new File([new Uint8Array(size)], name, { type: DOCX_MIME_TYPE });
}

afterEach(() => vi.restoreAllMocks());

test('two files show the one-at-a-time message and send nothing', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'a.docx', size: 1 }), docxFile({ name: 'b.docx', size: 1 })]));
  expect(result.current.message).toBe(ONE_FILE_AT_A_TIME_MESSAGE);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('no files do nothing', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([]));
  expect(result.current.message).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a pdf shows the docx-only message and a file over the limit shows the limit', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  expect(result.current.message).toBe(NOT_A_DOCX_MESSAGE);
  act(() => result.current.uploadFiles([docxFile({ name: 'big.docx', size: MAX_UPLOAD_BYTES + 1 })]));
  expect(result.current.message).toBe(UPLOAD_TOO_LARGE_MESSAGE);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('clear removes the message', () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  act(() => result.current.clear());
  expect(result.current.message).toBeNull();
});

test('one docx posts, refreshes the list and opens the document', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: UPLOADED_DOCUMENT, status: HttpStatus.Created }));
  const { result, queryClient, router } = renderHookWithRouter(useUploadDocument);
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(UPLOADED_DOCUMENT.id)));
  expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: HttpMethod.Post }));
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DOCUMENTS_QUERY_KEY });
});

test('a server failure becomes the message and a later rejection replaces it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.InternalServerError }));
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  await waitFor(() => expect(result.current.message).not.toBeNull());
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  expect(result.current.message).toBe(NOT_A_DOCX_MESSAGE);
});

test('while the upload runs the hook reports it as pending', async () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  await waitFor(() => expect(result.current.isPending).toBe(true));
});
