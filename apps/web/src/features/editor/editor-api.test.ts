import {
  documentApiPath,
  HEAVY_ROOMS_FULL_MESSAGE,
  HttpMethod,
  HttpStatus,
  TAB_QUERY_KEY,
  thumbnailApiPath,
  ThumbnailMimeType,
} from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { DocumentUnavailableError, ServerBusyError } from '@/lib/api';
import { tabId } from '@/lib/tab-id';
import { openDocument, sendThumbnailBeacon, uploadThumbnail } from './editor-api';

afterEach(() => vi.restoreAllMocks());

test('a 403 throws DocumentUnavailableError, so it never offers a retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status: HttpStatus.Forbidden }));
  const failure = await openDocument(DOCUMENT_ID).catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(DocumentUnavailableError);
});

test('a 503 throws ServerBusyError carrying the message of the server, so the waiting page can show it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ body: { error: HEAVY_ROOMS_FULL_MESSAGE }, status: HttpStatus.ServiceUnavailable }),
  );
  const failure = await openDocument(DOCUMENT_ID).catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(ServerBusyError);
  expect((failure as Error).message).toBe(HEAVY_ROOMS_FULL_MESSAGE);
});

test('opening a document names the tab asking, so a device claim answers Create to that tab only', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status: HttpStatus.Ok }));
  await openDocument(DOCUMENT_ID);
  expect(String(fetchSpy.mock.calls[0]![0])).toBe(`${documentApiPath({ documentId: DOCUMENT_ID })}?${TAB_QUERY_KEY}=${tabId()}`);
});

test('uploadThumbnail puts the image to the thumbnail route and reports whether it was stored', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  const blob = new Blob([new Uint8Array([1])], { type: ThumbnailMimeType.WebP });
  expect(await uploadThumbnail({ documentId: DOCUMENT_ID, blob })).toBe(true);
  expect(fetchSpy).toHaveBeenCalledWith(
    thumbnailApiPath({ documentId: DOCUMENT_ID }),
    expect.objectContaining({ method: HttpMethod.Put, body: blob }),
  );
});

test('a refused thumbnail upload reports false and throws nothing', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status: HttpStatus.PayloadTooLarge }));
  expect(await uploadThumbnail({ documentId: DOCUMENT_ID, blob: new Blob([new Uint8Array([1])]) })).toBe(false);
});

test('sendThumbnailBeacon hands the image to navigator.sendBeacon and returns its answer', () => {
  const beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal('navigator', { sendBeacon: beacon });
  const blob = new Blob([new Uint8Array([1])], { type: ThumbnailMimeType.WebP });
  expect(sendThumbnailBeacon({ documentId: DOCUMENT_ID, blob })).toBe(true);
  expect(beacon).toHaveBeenCalledWith(thumbnailApiPath({ documentId: DOCUMENT_ID }), blob);
  vi.unstubAllGlobals();
});
