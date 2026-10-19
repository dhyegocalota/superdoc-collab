import { HttpMethod, HttpStatus, thumbnailApiPath, ThumbnailMimeType } from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DocumentRole } from '@superdoc-collab/types';
import { DOCUMENT_ID, openedAs, READY_BOOTSTRAP } from '@/testing/opened-document';
import { DocumentUnavailableError } from '@/lib/api';
import { openDocument, sendThumbnailBeacon, uploadThumbnail } from './editor-api';

afterEach(() => vi.restoreAllMocks());

test.each([
  ['an answer with no estimate reads null', {}, null],
  ['an answer with an estimate keeps it', { estimatedMs: 40_000 }, 40_000],
])('%s', async (_, extra, expected) => {
  const body = { ...openedAs(DocumentRole.Editor), bootstrap: { ...READY_BOOTSTRAP, ...extra } };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body }));
  const opened = await openDocument(DOCUMENT_ID);
  expect(opened.bootstrap.estimatedMs).toBe(expected);
});

test('a 403 throws DocumentUnavailableError, so it never offers a retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status: HttpStatus.Forbidden }));
  const failure = await openDocument(DOCUMENT_ID).catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(DocumentUnavailableError);
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
