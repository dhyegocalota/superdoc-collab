import type { ThumbnailMimeType } from '@superdoc-collab/types';

export function thumbnailMimeTypeOf(bytes: Uint8Array): ThumbnailMimeType | null {
  throw new Error(`thumbnailMimeTypeOf is not implemented for ${bytes.length} bytes`);
}
