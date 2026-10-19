import { ThumbnailMimeType } from '@superdoc-collab/types';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];
const WEBP_SIGNATURE_OFFSET = 8;

function hasSignatureAt({ bytes, signature, offset }: { bytes: Uint8Array; signature: number[]; offset: number }): boolean {
  return signature.every((expected, index) => bytes[offset + index] === expected);
}

export function thumbnailMimeTypeOf(bytes: Uint8Array): ThumbnailMimeType | null {
  if (hasSignatureAt({ bytes, signature: PNG_SIGNATURE, offset: 0 })) return ThumbnailMimeType.Png;
  const isRiff = hasSignatureAt({ bytes, signature: RIFF_SIGNATURE, offset: 0 });
  const isWebp = hasSignatureAt({ bytes, signature: WEBP_SIGNATURE, offset: WEBP_SIGNATURE_OFFSET });
  if (isRiff && isWebp) return ThumbnailMimeType.WebP;
  return null;
}
