import {
  DocumentRole,
  HttpStatus,
  NON_NEGATIVE_INTEGER_PATTERN,
  RETRY_AFTER_SECONDS,
  TimelineQueryParam,
  VERSION_FAILED_ERROR,
  VERSION_NOT_READY_ERROR,
  versionCollaborationPath,
  type VersionMarks,
  type VersionSummary,
  type VersionText,
} from '@superdoc-history/types';
import { Hono } from 'hono';
import { z } from 'zod';
import { authorizedDocumentId } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { retryLater } from '../http/retry-later';
import { marksAround, VersionLookupKind } from './versions-service';

const INVALID_SEQUENCE_MESSAGE = 'sequence must be a non-negative integer';
const aroundSchema = z.string().regex(NON_NEGATIVE_INTEGER_PATTERN).transform(Number);

export function createVersionsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();

  routes.get('/:documentId/versions', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const parsed = aroundSchema.safeParse(context.req.query(TimelineQueryParam.Around));
    if (!parsed.success) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    const body: VersionMarks = {
      marks: marksAround({ marks: services.readModel.marks(documentId), sequence: parsed.data }).map(({ sequence, serverTime }) => ({
        sequence,
        serverTime,
      })),
    };
    return context.json(body);
  });

  routes.get('/:documentId/versions/:sequence', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const sequenceText = context.req.param('sequence');
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(sequenceText)) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    const mark = services.versions.resolve({ documentId, sequence: Number(sequenceText) });
    if (!mark && services.scheduler.isRebuilding(documentId))
      return retryLater({
        context,
        body: { sequence: Number(sequenceText) },
        status: HttpStatus.Accepted,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    if (!mark) return context.json({ error: VERSION_NOT_READY_ERROR }, HttpStatus.Conflict);
    const lookup = services.versions.peek({ documentId, sequence: mark.sequence });
    if (lookup.kind === VersionLookupKind.Failed)
      return retryLater({
        context,
        body: { error: VERSION_FAILED_ERROR },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    if (lookup.kind === VersionLookupKind.Pending)
      return retryLater({
        context,
        body: { sequence: mark.sequence },
        status: HttpStatus.Accepted,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    const summary: VersionSummary = {
      sequence: lookup.version.sequence,
      serverTime: lookup.version.serverTime,
      collaborationPath: versionCollaborationPath({ documentId, sequence: lookup.version.sequence }),
    };
    return context.json(summary);
  });

  routes.get('/:documentId/versions/:sequence/text', async (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const sequenceText = context.req.param('sequence');
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(sequenceText)) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    if (!services.versions.resolve({ documentId, sequence: Number(sequenceText) }))
      return context.json({ error: VERSION_NOT_READY_ERROR }, HttpStatus.Conflict);
    try {
      const { sequence, text } = await services.versions.load({ documentId, sequence: Number(sequenceText) });
      const body: VersionText = { sequence, text };
      return context.json(body);
    } catch {
      return retryLater({
        context,
        body: { error: VERSION_FAILED_ERROR },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    }
  });

  return routes;
}
