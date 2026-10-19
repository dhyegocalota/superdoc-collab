import {
  THUMBNAIL_DOWNSCALE_FACTOR,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_QUALITY,
  THUMBNAIL_WIDTH_PX,
  ThumbnailMimeType,
} from '@superdoc-collab/types';
import { toCanvas } from 'html-to-image';

export class ThumbnailTooLargeError extends Error {}
export class ThumbnailEncodingError extends Error {}

async function render({ page, width }: { page: HTMLElement; width: number }): Promise<Blob> {
  const height = Math.round((width * page.offsetHeight) / page.offsetWidth);
  const canvas = await toCanvas(page, { pixelRatio: 1, canvasWidth: width, canvasHeight: height });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ThumbnailEncodingError())), ThumbnailMimeType.WebP, THUMBNAIL_QUALITY),
  );
}

export async function captureThumbnail(page: HTMLElement): Promise<Blob> {
  const full = await render({ page, width: THUMBNAIL_WIDTH_PX });
  if (full.size <= THUMBNAIL_MAX_BYTES) return full;
  const downscaled = await render({ page, width: THUMBNAIL_WIDTH_PX * THUMBNAIL_DOWNSCALE_FACTOR });
  if (downscaled.size <= THUMBNAIL_MAX_BYTES) return downscaled;
  throw new ThumbnailTooLargeError();
}
