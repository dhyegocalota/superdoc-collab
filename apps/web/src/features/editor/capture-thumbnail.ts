export class ThumbnailTooLargeError extends Error {}

export function captureThumbnail(page: HTMLElement): Promise<Blob> {
  throw new Error(`captureThumbnail is not implemented for ${page.tagName}`);
}
