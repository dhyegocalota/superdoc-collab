import { SECOND_MS } from './constants';
import { documentApiPath, DocumentResource } from './routes';

const BYTES_PER_KILOBYTE = 1024;

export const THUMBNAIL_WIDTH_PX = 320;
export const THUMBNAIL_CAPTURE_DELAY_MS = 8 * SECOND_MS;
export const THUMBNAIL_MAX_BYTES = 200 * BYTES_PER_KILOBYTE;
export const THUMBNAIL_QUALITY = 0.8;
export const THUMBNAIL_DOWNSCALE_FACTOR = 0.5;
export const THUMBNAIL_VERSION_QUERY_KEY = 'v';
export const THUMBNAIL_UPLOADS_ATTRIBUTE = 'data-thumbnail-uploads';

export enum ThumbnailMimeType {
  WebP = 'image/webp',
  Png = 'image/png',
}

export function thumbnailApiPath({ documentId, updatedAt }: { documentId: string; updatedAt?: number }): string {
  const path = documentApiPath({ documentId, resource: DocumentResource.Thumbnail });
  if (updatedAt === undefined) return path;
  return `${path}?${THUMBNAIL_VERSION_QUERY_KEY}=${updatedAt}`;
}
