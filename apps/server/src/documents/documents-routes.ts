import { buildSeedDocx, declaredDocumentXmlBytes, DocxVerdict, inspectDocx, type SeedParagraph } from '@superdoc-collab/history';
import {
  BOOTSTRAP_QUEUE_FULL_MESSAGE,
  bootstrapBusyMessage,
  bootstrapLaneOf,
  BootstrapLane,
  bootstrapMemoryShortMessage,
  DOCUMENT_TOO_LARGE_MESSAGE,
  DOCX_EXTENSION,
  DOCX_MIME_TYPE,
  DocumentRole,
  HEAVY_ROOMS_FULL_MESSAGE,
  HEAVY_ROOMS_RETRY_AFTER_MS,
  HEAVY_ROOMS_USER_CAP_MESSAGE,
  HeavyRoomsRefusal,
  HttpStatus,
  INVALID_PREPARATION_MESSAGE,
  isPreparable,
  isTabId,
  largestPreparableMegabytes,
  MAX_UPLOAD_BYTES,
  MEMBER_NOT_FOUND_MESSAGE,
  NOT_A_DOCX_MESSAGE,
  OPEN_RATE_LIMITED_MESSAGE,
  OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE,
  PREPARATION_FIELD,
  PreparationSource,
  RoomMode,
  secondsRoundedUp,
  TAB_QUERY_KEY,
  TITLE_MAX_LENGTH,
  titleSchema,
  UNTITLED_DOCUMENT_TITLE,
  UPLOAD_FIELD,
  UPLOAD_RATE_LIMITED_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
  type UploadRefusal,
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

function isPreparationSource(value: unknown): value is PreparationSource {
  return Object.values(PreparationSource).some((source) => source === value);
}

function preparationSourceOf(value: unknown): PreparationSource | null {
  if (value === undefined) return PreparationSource.Server;
  if (isPreparationSource(value)) return value;
  return null;
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
type CreationMount = RouteMount & { memoryLimitMegabytes: number | null; maxBootstrapWaitMs: number };

function mountCreation({ routes, services, memoryLimitMegabytes, maxBootstrapWaitMs }: CreationMount): void {
  const { documents, storage, runtime, uploadBudget, heavyUploadBudget, heavyRooms } = services;

  function refusalWhenUploadsSpent(context: Context<SignedIn>): Response | null {
    const userId = context.var.user.id;
    const waitMs = uploadBudget.waitMs(userId);
    if (waitMs === null) return null;
    return retryLater({
      context,
      body: { error: UPLOAD_RATE_LIMITED_MESSAGE },
      status: HttpStatus.TooManyRequests,
      retryAfterSeconds: secondsRoundedUp(waitMs),
    });
  }

  function refusalWhenQueueFull({ context, documentXmlBytes }: { context: Context<SignedIn>; documentXmlBytes: number }): Response | null {
    const waitMs = runtime.bootstrapQueueWaitMs({ ownerUserId: context.var.user.id, documentXmlBytes });
    if (waitMs === null) return null;
    return retryLater({
      context,
      body: { error: BOOTSTRAP_QUEUE_FULL_MESSAGE },
      status: HttpStatus.TooManyRequests,
      retryAfterSeconds: secondsRoundedUp(waitMs),
    });
  }

  function refusalWhenBusy({ context, documentXmlBytes }: { context: Context<SignedIn>; documentXmlBytes: number }): Response | null {
    if (bootstrapLaneOf(documentXmlBytes) !== BootstrapLane.Heavy) return null;
    const waitMs = runtime.bootstrapWaitMs({ ownerUserId: context.var.user.id, documentXmlBytes });
    if (waitMs <= maxBootstrapWaitMs) return null;
    return retryLater({
      context,
      body: { error: bootstrapBusyMessage(waitMs) },
      status: HttpStatus.ServiceUnavailable,
      retryAfterSeconds: secondsRoundedUp(waitMs),
    });
  }

  function refusalWhenHeavyBudgetSpent({
    context,
    documentXmlBytes,
  }: {
    context: Context<SignedIn>;
    documentXmlBytes: number;
  }): Response | null {
    if (bootstrapLaneOf(documentXmlBytes) !== BootstrapLane.Heavy) return null;
    const waitMs = heavyUploadBudget.waitMs(context.var.user.id);
    if (waitMs === null) return null;
    return retryLater({
      context,
      body: { error: bootstrapBusyMessage(waitMs) },
      status: HttpStatus.TooManyRequests,
      retryAfterSeconds: secondsRoundedUp(waitMs),
    });
  }

  function refusalWhenRoomsFull({ context, documentXmlBytes }: { context: Context<SignedIn>; documentXmlBytes: number }): Response | null {
    if (heavyRooms.hasHeadroomFor({ documentXmlBytes })) return null;
    return retryLater({
      context,
      body: { error: HEAVY_ROOMS_FULL_MESSAGE },
      status: HttpStatus.ServiceUnavailable,
      retryAfterSeconds: secondsRoundedUp(HEAVY_ROOMS_RETRY_AFTER_MS),
    });
  }

  function refusalWhenMemoryShort({
    context,
    documentXmlBytes,
  }: {
    context: Context<SignedIn>;
    documentXmlBytes: number;
  }): Response | null {
    if (memoryLimitMegabytes === null) return null;
    if (isPreparable({ documentXmlBytes, memoryLimitMegabytes })) return null;
    const refusal: UploadRefusal = {
      error: bootstrapMemoryShortMessage(largestPreparableMegabytes(memoryLimitMegabytes)),
      canPrepareOnDevice: true,
    };
    return context.json(refusal, HttpStatus.PayloadTooLarge);
  }

  async function respondWithStoredDocument({
    context,
    bytes,
    title,
    importRevisions,
    isBlank,
  }: {
    context: Context<SignedIn>;
    bytes: Uint8Array;
    title: string;
    importRevisions: boolean;
    isBlank: boolean;
  }): Promise<Response> {
    const queueRefusal = refusalWhenQueueFull({ context, documentXmlBytes: declaredDocumentXmlBytes(bytes) });
    if (queueRefusal) return queueRefusal;
    const busyRefusal = refusalWhenBusy({ context, documentXmlBytes: declaredDocumentXmlBytes(bytes) });
    if (busyRefusal) return busyRefusal;
    const heavyBudgetRefusal = refusalWhenHeavyBudgetSpent({ context, documentXmlBytes: declaredDocumentXmlBytes(bytes) });
    if (heavyBudgetRefusal) return heavyBudgetRefusal;
    const roomsRefusal = refusalWhenRoomsFull({ context, documentXmlBytes: declaredDocumentXmlBytes(bytes) });
    if (roomsRefusal) return roomsRefusal;
    const userId = context.var.user.id;
    uploadBudget.record(userId);
    if (bootstrapLaneOf(declaredDocumentXmlBytes(bytes)) === BootstrapLane.Heavy) heavyUploadBudget.record(userId);
    const documentId = await storeDocument({ documents, storage, runtime, ownerUserId: userId, title, bytes, importRevisions, isBlank });
    heavyRooms.reserveForUpload({ documentId, userId });
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
      isBlank: true,
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
      const uploadsRefusal = refusalWhenUploadsSpent(context);
      if (uploadsRefusal) return uploadsRefusal;
      const isUpload = context.req.header('content-type')?.startsWith(MULTIPART_CONTENT_TYPE) === true;
      if (!isUpload) return createBlank(context);
      const body = await context.req.parseBody().catch(() => null);
      if (!body) return context.json({ error: MALFORMED_UPLOAD_MESSAGE }, HttpStatus.BadRequest);
      const file = body[UPLOAD_FIELD];
      if (!(file instanceof File)) return context.json({ error: NOT_A_DOCX_MESSAGE }, HttpStatus.UnsupportedMediaType);
      if (file.size > MAX_UPLOAD_BYTES) return context.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge);
      const preparation = preparationSourceOf(body[PREPARATION_FIELD]);
      if (preparation === null) return context.json({ error: INVALID_PREPARATION_MESSAGE }, HttpStatus.BadRequest);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const verdict = file.type === DOCX_MIME_TYPE ? await inspectDocx(bytes) : DocxVerdict.NotADocx;
      if (verdict === DocxVerdict.TooLarge) return context.json({ error: DOCUMENT_TOO_LARGE_MESSAGE }, HttpStatus.UnsupportedMediaType);
      if (verdict !== DocxVerdict.Accepted) return context.json({ error: NOT_A_DOCX_MESSAGE }, HttpStatus.UnsupportedMediaType);
      const memoryRefusal = refusalWhenMemoryShort({ context, documentXmlBytes: declaredDocumentXmlBytes(bytes) });
      const isDevicePreparation = preparation === PreparationSource.Device;
      if (memoryRefusal && !isDevicePreparation) return memoryRefusal;
      return respondWithStoredDocument({ context, bytes, title: titleFromFileName(file.name), importRevisions: true, isBlank: false });
    },
  );
}

function mountOpening({ routes, services }: RouteMount): void {
  const { documents, runtime, heavyRooms } = services;

  routes.get('/:documentId', (context) => {
    const documentId = context.req.param('documentId');
    const userId = context.var.user.id;
    const role = requireDocumentRole({ documents, documentId, userId, minimumRole: DocumentRole.Reader });
    const summary = documents.summary({ documentId, userId });
    const isUserCapRefusal =
      !heavyRooms.fits({ documentId, userId }) && heavyRooms.refusalOf({ documentId, userId }) === HeavyRoomsRefusal.UserCap;
    if (isUserCapRefusal) return context.json({ error: HEAVY_ROOMS_USER_CAP_MESSAGE }, HttpStatus.ServiceUnavailable);
    if (!heavyRooms.fits({ documentId, userId })) {
      return retryLater({
        context,
        body: { error: HEAVY_ROOMS_FULL_MESSAGE },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: secondsRoundedUp(HEAVY_ROOMS_RETRY_AFTER_MS),
      });
    }
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
    const bootstrap = runtime.bootstrapRoom(documentId);
    const tab = context.req.query(TAB_QUERY_KEY);
    const tabId = tab !== undefined && isTabId(tab) ? tab : null;
    const isDeviceCreator = runtime.isDeviceCreator({ documentId, userId, tabId });
    return context.json({
      document: summary,
      role,
      roomMode: isDeviceCreator ? RoomMode.Create : RoomMode.Join,
      bootstrap,
      preparedOnDeviceOf: runtime.isPreparedOnDevice(documentId) ? summary.owner.name : null,
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
    });
  });
}

export function createDocumentsRoutes({
  services,
  memoryLimitMegabytes,
  maxBootstrapWaitMs,
}: {
  services: AppServices;
  memoryLimitMegabytes: number | null;
  maxBootstrapWaitMs: number;
}): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  mountCreation({ routes, services, memoryLimitMegabytes, maxBootstrapWaitMs });
  mountOpening({ routes, services });
  mountManagement({ routes, services });
  mountReading({ routes, services });
  mountThumbnail({ routes, services });
  return routes;
}
