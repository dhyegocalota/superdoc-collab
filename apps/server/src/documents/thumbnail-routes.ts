import { DocumentRole, HttpMethod, HttpStatus, THUMBNAIL_MAX_BYTES } from '@superdoc-collab/types';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { authorizedDocumentId, DocumentNotFoundError } from './require-document-role';
import { thumbnailMimeTypeOf } from './thumbnail-image';

const THUMBNAIL_TOO_LARGE_MESSAGE = 'The thumbnail is too large';
const NOT_A_THUMBNAIL_MESSAGE = 'Only WebP and PNG thumbnails can be stored';
const NO_THUMBNAIL_MESSAGE = 'This document has no thumbnail';
const REVALIDATE_EVERY_TIME = 'private, max-age=0, must-revalidate';

class StoredThumbnailUnreadableError extends Error {}

export function mountThumbnail({ routes, services }: { routes: Hono<SignedIn>; services: AppServices }): void {
  const { documents, storage } = services;

  routes.on(
    [HttpMethod.Put, HttpMethod.Post],
    '/:documentId/thumbnail',
    bodyLimit({
      maxSize: THUMBNAIL_MAX_BYTES,
      onError: (context) => context.json({ error: THUMBNAIL_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge),
    }),
    async (context) => {
      const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Editor });
      const bytes = new Uint8Array(await context.req.arrayBuffer());
      const mimeType = thumbnailMimeTypeOf(bytes);
      const isDeclaredAsDetected = mimeType !== null && context.req.header('content-type') === mimeType;
      if (!isDeclaredAsDetected) return context.json({ error: NOT_A_THUMBNAIL_MESSAGE }, HttpStatus.UnsupportedMediaType);
      await storage.putThumbnail({ documentId, bytes });
      const isRecorded = documents.recordThumbnail(documentId);
      if (isRecorded) return context.body(null, HttpStatus.NoContent);
      await storage.remove(documentId);
      throw new DocumentNotFoundError();
    },
  );

  routes.get('/:documentId/thumbnail', async (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Reader });
    const { thumbnailUpdatedAt } = documents.summary({ documentId, userId: context.var.user.id });
    if (thumbnailUpdatedAt === null) return context.json({ error: NO_THUMBNAIL_MESSAGE }, HttpStatus.NotFound);
    const entityTag = `"${thumbnailUpdatedAt}"`;
    const headers = { etag: entityTag, 'cache-control': REVALIDATE_EVERY_TIME };
    if (context.req.header('if-none-match') === entityTag) return new Response(null, { status: HttpStatus.NotModified, headers });
    const bytes = await storage.readThumbnail(documentId);
    const mimeType = thumbnailMimeTypeOf(bytes);
    if (mimeType === null) throw new StoredThumbnailUnreadableError(documentId);
    return new Response(Buffer.from(bytes), { headers: { ...headers, 'content-type': mimeType } });
  });
}
