import { buildSeedDocx, isDocx, type SeedParagraph } from '@superdoc-collab/history';
import {
  DOCUMENT_NOT_READY_ERROR,
  DOCX_EXTENSION,
  DOCX_MIME_TYPE,
  DocumentRole,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  NOT_A_DOCX_MESSAGE,
  RoomMode,
  TITLE_MAX_LENGTH,
  titleSchema,
  UNTITLED_DOCUMENT_TITLE,
  UPLOAD_FIELD,
  UPLOAD_TOO_LARGE_MESSAGE,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { authorizedDocumentId, requireDocumentRole } from './require-document-role';

const RENAME_BODY_MAX_BYTES = 4 * 1024;
const MULTIPART_ENVELOPE_BYTES = 64 * 1024;
const MULTIPART_CONTENT_TYPE = 'multipart/form-data';
const BLANK_DOCUMENT: SeedParagraph[] = [{ text: '', trackedChanges: [] }];
const REQUEST_TOO_LARGE_MESSAGE = 'The request body is too large';
const INVALID_TITLE_MESSAGE = 'The title must not be blank';
const DOCX_EXTENSION_PATTERN = /\.docx$/i;
const MALFORMED_UPLOAD_MESSAGE = 'The upload could not be read';
const RFC_5987_RESERVED = /['()*]/g;
const UNSAFE_IN_QUOTED_FILENAME = /[^\x20-\x7e]|["\\]/g;
const ASCII_FALLBACK_CHARACTER = '_';
const HEX_RADIX = 16;

function titleFromFileName(fileName: string): string {
  const title = basename(fileName).replace(DOCX_EXTENSION_PATTERN, '').trim().slice(0, TITLE_MAX_LENGTH).trim();
  if (!title) return UNTITLED_DOCUMENT_TITLE;
  return title;
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(UNSAFE_IN_QUOTED_FILENAME, ASCII_FALLBACK_CHARACTER);
  const encoded = encodeURIComponent(fileName).replace(
    RFC_5987_RESERVED,
    (character) => `%${character.charCodeAt(0).toString(HEX_RADIX).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function createDocumentsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const { documents, storage, runtime } = services;
  const routes = new Hono<SignedIn>();

  async function storeDocument({
    context,
    bytes,
    title,
    importRevisions,
  }: {
    context: Context<SignedIn>;
    bytes: Uint8Array;
    title: string;
    importRevisions: boolean;
  }): Promise<Response> {
    const documentId = randomUUID();
    const userId = context.var.user.id;
    documents.create({ id: documentId, title, ownerUserId: userId });
    await storage.put({ documentId, bytes }).catch((error: unknown) => {
      documents.remove(documentId);
      throw error;
    });
    if (importRevisions) runtime.importRevisions(documentId);
    return context.json(documents.summary({ documentId, userId }), HttpStatus.Created);
  }

  async function createBlank(context: Context<SignedIn>): Promise<Response> {
    const parsed = titleSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: INVALID_TITLE_MESSAGE }, HttpStatus.BadRequest);
    return storeDocument({ context, bytes: await buildSeedDocx(BLANK_DOCUMENT), title: parsed.data.title, importRevisions: false });
  }

  routes.get('/', (context) => context.json(documents.list(context.var.user.id)));

  routes.post(
    '/',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + MULTIPART_ENVELOPE_BYTES,
      onError: (context) => context.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge),
    }),
    async (context) => {
      const isUpload = context.req.header('content-type')?.startsWith(MULTIPART_CONTENT_TYPE) === true;
      if (!isUpload) return createBlank(context);
      const body = await context.req.parseBody().catch(() => null);
      if (!body) return context.json({ error: MALFORMED_UPLOAD_MESSAGE }, HttpStatus.BadRequest);
      const file = body[UPLOAD_FIELD];
      if (!(file instanceof File)) return context.json({ error: NOT_A_DOCX_MESSAGE }, HttpStatus.UnsupportedMediaType);
      if (file.size > MAX_UPLOAD_BYTES) return context.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isAcceptedDocx = file.type === DOCX_MIME_TYPE && (await isDocx(bytes));
      if (!isAcceptedDocx) return context.json({ error: NOT_A_DOCX_MESSAGE }, HttpStatus.UnsupportedMediaType);
      return storeDocument({ context, bytes, title: titleFromFileName(file.name), importRevisions: true });
    },
  );

  routes.get('/:documentId', (context) => {
    const documentId = context.req.param('documentId');
    const userId = context.var.user.id;
    const role = requireDocumentRole({ documents, documentId, userId, minimumRole: DocumentRole.Reader });
    const roomMode = runtime.roomMode(documentId);
    const mustWaitForCreator = roomMode === RoomMode.Create && role === DocumentRole.Reader;
    if (mustWaitForCreator) return context.json({ error: DOCUMENT_NOT_READY_ERROR }, HttpStatus.Conflict);
    return context.json({ document: documents.summary({ documentId, userId }), role, roomMode });
  });

  routes.patch(
    '/:documentId',
    bodyLimit({
      maxSize: RENAME_BODY_MAX_BYTES,
      onError: (context) => context.json({ error: REQUEST_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge),
    }),
    async (context) => {
      const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Editor });
      const userId = context.var.user.id;
      const parsed = titleSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) return context.json({ error: INVALID_TITLE_MESSAGE }, HttpStatus.BadRequest);
      documents.rename({ documentId, title: parsed.data.title });
      return context.json(documents.summary({ documentId, userId }));
    },
  );

  routes.delete('/:documentId', async (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Owner });
    documents.remove(documentId);
    await runtime.forget(documentId);
    await storage.remove(documentId);
    return context.body(null, HttpStatus.NoContent);
  });

  routes.get('/:documentId/download', async (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Reader });
    const userId = context.var.user.id;
    const { title } = documents.summary({ documentId, userId });
    return new Response(Buffer.from(await storage.read(documentId)), {
      headers: { 'content-type': DOCX_MIME_TYPE, 'content-disposition': contentDisposition(`${title}${DOCX_EXTENSION}`) },
    });
  });

  routes.get('/:documentId/members', (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Reader });
    const online = runtime.onlineUserIds(documentId);
    return context.json({
      members: documents.members(documentId).map((member) => ({ ...member, online: online.has(member.user.id) })),
      isCurrentUserOnline: online.has(context.var.user.id),
    });
  });

  return routes;
}
