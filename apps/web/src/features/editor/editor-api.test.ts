import { DocumentRole, HttpMethod, HttpStatus, thumbnailApiPath, ThumbnailMimeType } from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID, openedAs, READY_BOOTSTRAP } from '@/testing/opened-document';
import { DocumentUnavailableError } from '@/lib/api';
import { openDocument, sendThumbnailBeacon, uploadThumbnail } from './editor-api';

afterEach(() => vi.restoreAllMocks());

test.each([
  ['an answer with no preparingSince reads null', undefined, null],
  ['an answer with a preparingSince keeps it', 1_700_000_000_000, 1_700_000_000_000],
])('%s', async (_, preparingSince, expected) => {
  const { preparingSince: _absent, ...progress } = READY_BOOTSTRAP;
  const bootstrap = preparingSince === undefined ? progress : { ...progress, preparingSince };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { ...openedAs(DocumentRole.Editor), bootstrap } }));
  const opened = await openDocument(DOCUMENT_ID);
  expect(opened.bootstrap.preparingSince).toBe(expected);
});

test.each([
  ['an answer with no fileBytes reads null', undefined, null],
  ['an answer with fileBytes keeps it', 9_961_472, 9_961_472],
])('%s', async (_, fileBytes, expected) => {
  const { fileBytes: _absent, ...progress } = READY_BOOTSTRAP;
  const bootstrap = fileBytes === undefined ? progress : { ...progress, fileBytes };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { ...openedAs(DocumentRole.Editor), bootstrap } }));
  const opened = await openDocument(DOCUMENT_ID);
  expect(opened.bootstrap.fileBytes).toBe(expected);
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
