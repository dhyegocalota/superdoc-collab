import { buildSeedDocx, isDocx, type SeedParagraph } from '@superdoc-collab/history';
import {
  DOCX_EXTENSION,
  DOCX_MIME_TYPE,
  DocumentRole,
  HttpStatus,
  isTabId,
  MAX_UPLOAD_BYTES,
  MEMBER_NOT_FOUND_MESSAGE,
  NOT_A_DOCX_MESSAGE,
  OPEN_RATE_LIMITED_MESSAGE,
  OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE,
  RoomMode,
  secondsRoundedUp,
  TAB_QUERY_KEY,
  TITLE_MAX_LENGTH,
  titleSchema,
  UNTITLED_DOCUMENT_TITLE,
  UPLOAD_FIELD,
  UPLOAD_TOO_LARGE_MESSAGE,
} from '@superdoc-collab/types';
import { basename } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppServices } from '../http/app';
import { retryLater } from '../http/retry-later';
import type { SignedIn } from '../http/require-user';
import { authorizedDocumentId, requireDocumentRole } from './require-document-role';
import { mountThumbnail } from './thumbnail-routes';
import { storeDocument } from './store-document';

const MEMBER_USER_ID_PARAM = 'userId';
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

type RouteMount = { routes: Hono<SignedIn>; services: AppServices };

function mountCreation({ routes, services }: RouteMount): void {
  const { documents, storage, runtime } = services;

  async function respondWithStoredDocument({
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
    const userId = context.var.user.id;
    const documentId = await storeDocument({ documents, storage, runtime, ownerUserId: userId, title, bytes, importRevisions });
    return context.json(documents.summary({ documentId, userId }), HttpStatus.Created);
  }

  async function createBlank(context: Context<SignedIn>): Promise<Response> {
    const parsed = titleSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: INVALID_TITLE_MESSAGE }, HttpStatus.BadRequest);
    return respondWithStoredDocument({
      context,
      bytes: await buildSeedDocx(BLANK_DOCUMENT),
      title: parsed.data.title,
      importRevisions: false,
    });
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
      return respondWithStoredDocument({ context, bytes, title: titleFromFileName(file.name), importRevisions: true });
    },
  );
}

function mountOpening({ routes, services }: RouteMount): void {
  const { documents, runtime } = services;

  routes.get('/:documentId', (context) => {
    const documentId = context.req.param('documentId');
    const userId = context.var.user.id;
    const role = requireDocumentRole({ documents, documentId, userId, minimumRole: DocumentRole.Reader });
    const summary = documents.summary({ documentId, userId });
    const answer = runtime.roomModeFor({ documentId, userId });
    if (answer.isSpent) {
      console.warn(`${OPEN_RATE_LIMITED_MESSAGE} ${documentId}`);
      return retryLater({
        context,
        body: { error: OPEN_RATE_LIMITED_MESSAGE },
        status: HttpStatus.TooManyRequests,
        retryAfterSeconds: secondsRoundedUp(answer.waitMs),
      });
    }
    return context.json({
      document: summary,
      role,
      roomMode: RoomMode.Join,
      creatorAttempt: null,
      creatorEpoch: null,
      bootstrap: runtime.bootstrapRoom(documentId),
      colorSlot: documents.colorSlotOf({ documentId, userId }),
    });
  });
}

function mountManagement({ routes, services }: RouteMount): void {
  const { documents, storage, runtime } = services;

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

  routes.delete('/:documentId/members/:userId', (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Owner });
    const userId = context.req.param(MEMBER_USER_ID_PARAM);
    const role = documents.findRole({ documentId, userId });
    if (!role) return context.json({ error: MEMBER_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    if (role === DocumentRole.Owner) return context.json({ error: OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE }, HttpStatus.BadRequest);
    documents.revoke({ documentId, userId });
    runtime.closeUserConnections({ documentId, userId });
    return context.body(null, HttpStatus.NoContent);
  });
}

function mountReading({ routes, services }: RouteMount): void {
  const { documents, storage, runtime } = services;

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
    const tab = context.req.query(TAB_QUERY_KEY);
    const isTabAsked = tab !== undefined && isTabId(tab);
    const isCurrentUserOnline = isTabAsked
      ? runtime.onlineTabIds({ documentId, userId: context.var.user.id }).has(tab)
      : online.has(context.var.user.id);
    return context.json({
      members: documents.membersWithColorSlots(documentId).map((member) => ({ ...member, online: online.has(member.user.id) })),
      isCurrentUserOnline,
      isAttemptSuperseded: false,
      isAttemptRestarted: false,
    });
  });
}

export function createDocumentsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  mountCreation({ routes, services });
  mountOpening({ routes, services });
  mountManagement({ routes, services });
  mountReading({ routes, services });
  mountThumbnail({ routes, services });
  return routes;
}
