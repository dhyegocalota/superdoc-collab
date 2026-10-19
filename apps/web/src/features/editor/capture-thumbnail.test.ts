import { THUMBNAIL_MAX_BYTES, THUMBNAIL_QUALITY, THUMBNAIL_WIDTH_PX, ThumbnailMimeType } from '@superdoc-collab/types';
import { toCanvas } from 'html-to-image';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { captureThumbnail, ThumbnailTooLargeError } from './capture-thumbnail';

vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));

const PAGE_WIDTH_PX = 816;
const PAGE_HEIGHT_PX = 1056;
const SMALL_BYTES = 20_000;
const LARGE_BYTES = THUMBNAIL_MAX_BYTES + 1;
const HALF_WIDTH_PX = THUMBNAIL_WIDTH_PX / 2;

function pageElement(): HTMLElement {
  const page = document.createElement('div');
  Object.defineProperty(page, 'offsetWidth', { value: PAGE_WIDTH_PX });
  Object.defineProperty(page, 'offsetHeight', { value: PAGE_HEIGHT_PX });
  return page;
}

function renderingBlobs(blobs: (Blob | null)[]): void {
  const queue = [...blobs];
  vi.mocked(toCanvas).mockImplementation(async () => {
    const blob = queue.shift();
    if (blob === undefined) throw new Error('unexpected render');
    return { toBlob: (callback: BlobCallback) => callback(blob) } as unknown as HTMLCanvasElement;
  });
}

function imageOf(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: ThumbnailMimeType.WebP });
}

beforeEach(() => {
  vi.mocked(toCanvas).mockReset();
});
afterEach(() => vi.restoreAllMocks());

test('the first page is rendered at the thumbnail width with its own aspect ratio and returned when small', async () => {
  const blob = imageOf(SMALL_BYTES);
  const page = pageElement();
  renderingBlobs([blob]);
  expect(await captureThumbnail(page)).toBe(blob);
  expect(toCanvas).toHaveBeenCalledTimes(1);
  expect(toCanvas).toHaveBeenCalledWith(
    page,
    expect.objectContaining({
      pixelRatio: 1,
      canvasWidth: THUMBNAIL_WIDTH_PX,
      canvasHeight: Math.round((THUMBNAIL_WIDTH_PX * PAGE_HEIGHT_PX) / PAGE_WIDTH_PX),
    }),
  );
});

test('a capture above the size limit is rendered once more at half the width', async () => {
  const smaller = imageOf(SMALL_BYTES);
  renderingBlobs([imageOf(LARGE_BYTES), smaller]);
  expect(await captureThumbnail(pageElement())).toBe(smaller);
  expect(toCanvas).toHaveBeenCalledTimes(2);
  expect(vi.mocked(toCanvas).mock.calls[1]![1]).toEqual(expect.objectContaining({ canvasWidth: HALF_WIDTH_PX }));
});

test('a capture still above the limit after the downscale is dropped', async () => {
  renderingBlobs([imageOf(LARGE_BYTES), imageOf(LARGE_BYTES)]);
  await expect(captureThumbnail(pageElement())).rejects.toBeInstanceOf(ThumbnailTooLargeError);
  expect(toCanvas).toHaveBeenCalledTimes(2);
});

test('a canvas that cannot encode rejects instead of returning nothing', async () => {
  renderingBlobs([null]);
  await expect(captureThumbnail(pageElement())).rejects.toThrow();
});

test('the encoder is asked for WebP at the configured quality', async () => {
  const toBlob = vi.fn((callback: BlobCallback) => callback(imageOf(SMALL_BYTES)));
  vi.mocked(toCanvas).mockResolvedValue({ toBlob } as unknown as HTMLCanvasElement);
  await captureThumbnail(pageElement());
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), ThumbnailMimeType.WebP, THUMBNAIL_QUALITY);
});
