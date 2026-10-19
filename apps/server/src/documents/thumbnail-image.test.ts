import { ThumbnailMimeType } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { thumbnailMimeTypeOf } from './thumbnail-image';

const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
const RIFF_WAVE_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);

test('the magic bytes name a WebP and a PNG', () => {
  expect([thumbnailMimeTypeOf(WEBP_BYTES), thumbnailMimeTypeOf(PNG_BYTES)]).toEqual([ThumbnailMimeType.WebP, ThumbnailMimeType.Png]);
});

test.each([
  ['a JPEG', JPEG_BYTES],
  ['a DOCX', DOCX_BYTES],
  ['a RIFF container that is not WebP', RIFF_WAVE_BYTES],
  ['a truncated header', WEBP_BYTES.slice(0, 6)],
  ['nothing', new Uint8Array()],
])('%s is not a thumbnail', (_name, bytes) => {
  expect(thumbnailMimeTypeOf(bytes)).toBeNull();
});
