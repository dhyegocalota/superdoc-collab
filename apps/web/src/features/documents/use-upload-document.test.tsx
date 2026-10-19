import {
  ApiPath,
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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FakeUploadRequest, latestUploadRequest, stubUploadRequests, restoreUploadRequests } from '@/testing/fake-upload-request';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { DOCUMENTS_QUERY_KEY } from './documents-api';
import { ONE_FILE_AT_A_TIME_MESSAGE } from './documents-copy';
import { useUploadDocument } from './use-upload-document';

const UPLOADED_DOCUMENT = { id: 'doc-1', title: 'plan', owner: { id: 'user-1', name: 'Ada' }, updatedAt: 1, role: DocumentRole.Owner };

function docxFile({ name, size }: { name: string; size: number }): File {
  return new File([new Uint8Array(size)], name, { type: DOCX_MIME_TYPE });
}

beforeEach(stubUploadRequests);

afterEach(() => {
  vi.restoreAllMocks();
  restoreUploadRequests();
});

test('two files show the one-at-a-time message and send nothing', () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'a.docx', size: 1 }), docxFile({ name: 'b.docx', size: 1 })]));
  expect(result.current.message).toBe(ONE_FILE_AT_A_TIME_MESSAGE);
  expect(FakeUploadRequest.requests).toHaveLength(0);
});

test('no files do nothing', () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([]));
  expect(result.current.message).toBeNull();
  expect(FakeUploadRequest.requests).toHaveLength(0);
});

test('a pdf shows the docx-only message and a file over the limit shows the limit', () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  expect(result.current.message).toBe(NOT_A_DOCX_MESSAGE);
  act(() => result.current.uploadFiles([docxFile({ name: 'big.docx', size: MAX_UPLOAD_BYTES + 1 })]));
  expect(result.current.message).toBe(UPLOAD_TOO_LARGE_MESSAGE);
  expect(FakeUploadRequest.requests).toHaveLength(0);
});

test('clear removes the message', () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  act(() => result.current.clear());
  expect(result.current.message).toBeNull();
});

test('one docx posts, refreshes the list and opens the document', async () => {
  const { result, queryClient, router } = renderHookWithRouter(useUploadDocument);
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const request = latestUploadRequest();
  expect(request.method).toBe(HttpMethod.Post);
  expect(request.path).toBe(ApiPath.Documents);
  act(() => request.respond({ status: HttpStatus.Created, body: UPLOADED_DOCUMENT }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(UPLOADED_DOCUMENT.id)));
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DOCUMENTS_QUERY_KEY });
});

test('a server failure becomes the message and a later rejection replaces it', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  act(() => latestUploadRequest().respond({ status: HttpStatus.InternalServerError, body: null }));
  await waitFor(() => expect(result.current.message).not.toBeNull());
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  expect(result.current.message).toBe(NOT_A_DOCX_MESSAGE);
});

test('while the upload runs the hook reports it as pending with the bytes sent so far, and clears both when it ends', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  expect(result.current.progress).toBeNull();
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  await waitFor(() => expect(result.current.isPending).toBe(true));
  expect(result.current.progress).toBeNull();
  act(() => latestUploadRequest().reportProgress({ lengthComputable: true, loaded: 40, total: 100 }));
  expect(result.current.progress).toEqual({ sentBytes: 40, totalBytes: 100 });
  act(() => latestUploadRequest().respond({ status: HttpStatus.InternalServerError, body: null }));
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(result.current.progress).toBeNull();
});
