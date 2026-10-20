import {
  ApiPath,
  DocumentRole,
  DOCX_MIME_TYPE,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  bootstrapMemoryShortMessage,
  NOT_A_DOCX_MESSAGE,
  PREPARATION_FIELD,
  PreparationSource,
  UPLOAD_FIELD,
  UPLOAD_TOO_LARGE_MESSAGE,
} from '@superdoc-collab/types';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  FakeUploadRequest,
  latestUploadRequest,
  sentUploadRequest,
  stubUploadRequests,
  restoreUploadRequests,
} from '@/testing/fake-upload-request';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { DeviceRefusal, useDeviceRefusal } from '@/features/local-preview/device-guard';
import { localFileOf } from '@/features/local-preview/local-file-store';
import { DOCUMENTS_QUERY_KEY } from './documents-api';
import { ONE_FILE_AT_A_TIME_MESSAGE } from './documents-copy';
import { useUploadDocument } from './use-upload-document';

vi.mock('@/features/local-preview/device-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/local-preview/device-guard')>()),
  useDeviceRefusal: vi.fn(() => null),
}));

const REFUSAL_MESSAGE = bootstrapMemoryShortMessage(4);
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
  const request = await sentUploadRequest();
  expect(request.method).toBe(HttpMethod.Post);
  expect(request.path).toBe(ApiPath.Documents);
  act(() => request.respond({ status: HttpStatus.Created, body: UPLOADED_DOCUMENT }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(UPLOADED_DOCUMENT.id)));
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DOCUMENTS_QUERY_KEY });
});

test('a server failure becomes the message and a later rejection replaces it', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const requestSent = await sentUploadRequest();
  act(() => requestSent.respond({ status: HttpStatus.InternalServerError, body: null }));
  await waitFor(() => expect(result.current.message).not.toBeNull());
  act(() => result.current.uploadFiles([docxFile({ name: 'report.pdf', size: 1 })]));
  expect(result.current.message).toBe(NOT_A_DOCX_MESSAGE);
});

test('a refusal of the server for its memory shows the largest file it can prepare', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  const message = bootstrapMemoryShortMessage(8);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const request = await sentUploadRequest();
  act(() => request.respond({ status: HttpStatus.PayloadTooLarge, body: { error: message } }));
  await waitFor(() => expect(result.current.message).toBe(message));
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

test('the uploaded file is kept for the preview under the id of the new document before the page opens', async () => {
  const { result, router } = renderHookWithRouter(useUploadDocument);
  const file = docxFile({ name: 'plan.docx', size: 1 });
  act(() => result.current.uploadFiles([file]));
  await sentUploadRequest();
  act(() => latestUploadRequest().respond({ status: HttpStatus.Created, body: UPLOADED_DOCUMENT }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(UPLOADED_DOCUMENT.id)));
  expect(localFileOf(UPLOADED_DOCUMENT.id)).toBe(file);
});

test('a refusal for memory that the device can answer offers to prepare on this device', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const request = await sentUploadRequest();
  act(() => request.respond({ status: HttpStatus.PayloadTooLarge, body: { error: REFUSAL_MESSAGE, canPrepareOnDevice: true } }));
  await waitFor(() => expect(result.current.message).toBe(REFUSAL_MESSAGE));
  expect(result.current.devicePreparation).toEqual({ refusal: null, start: expect.any(Function) });
});

test('a refusal without the device answer offers nothing', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const request = await sentUploadRequest();
  act(() => request.respond({ status: HttpStatus.PayloadTooLarge, body: { error: UPLOAD_TOO_LARGE_MESSAGE, canPrepareOnDevice: false } }));
  await waitFor(() => expect(result.current.message).toBe(UPLOAD_TOO_LARGE_MESSAGE));
  expect(result.current.devicePreparation).toBeNull();
});

test('accepting the offer sends the same file again for the device, and keeps it when the document is created', async () => {
  const { result, router } = renderHookWithRouter(useUploadDocument);
  const file = docxFile({ name: 'plan.docx', size: 1 });
  act(() => result.current.uploadFiles([file]));
  const refused = await sentUploadRequest();
  act(() => refused.respond({ status: HttpStatus.PayloadTooLarge, body: { error: REFUSAL_MESSAGE, canPrepareOnDevice: true } }));
  await waitFor(() => expect(result.current.devicePreparation).not.toBeNull());
  act(() => result.current.devicePreparation!.start());
  await waitFor(() => expect(FakeUploadRequest.requests).toHaveLength(2));
  const form = latestUploadRequest().body as FormData;
  expect([form.get(UPLOAD_FIELD), form.get(PREPARATION_FIELD)]).toEqual([file, PreparationSource.Device]);
  act(() => latestUploadRequest().respond({ status: HttpStatus.Created, body: UPLOADED_DOCUMENT }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(UPLOADED_DOCUMENT.id)));
  expect(localFileOf(UPLOADED_DOCUMENT.id)).toBe(file);
});

test('a first upload sends no preparation field', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const form = (await sentUploadRequest()).body as FormData;
  expect(form.has(PREPARATION_FIELD)).toBe(false);
});

test('a device that cannot prepare names the reason instead of offering the button', async () => {
  vi.mocked(useDeviceRefusal).mockReturnValue(DeviceRefusal.NarrowViewport);
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const request = await sentUploadRequest();
  act(() => request.respond({ status: HttpStatus.PayloadTooLarge, body: { error: REFUSAL_MESSAGE, canPrepareOnDevice: true } }));
  await waitFor(() => expect(result.current.devicePreparation).not.toBeNull());
  expect(result.current.devicePreparation!.refusal).toBe(DeviceRefusal.NarrowViewport);
  vi.mocked(useDeviceRefusal).mockReturnValue(null);
});

test('clearing removes the offer', async () => {
  const { result } = renderHookWithRouter(useUploadDocument);
  act(() => result.current.uploadFiles([docxFile({ name: 'plan.docx', size: 1 })]));
  const request = await sentUploadRequest();
  act(() => request.respond({ status: HttpStatus.PayloadTooLarge, body: { error: REFUSAL_MESSAGE, canPrepareOnDevice: true } }));
  await waitFor(() => expect(result.current.devicePreparation).not.toBeNull());
  act(() => result.current.clear());
  await waitFor(() => expect(result.current.devicePreparation).toBeNull());
});
