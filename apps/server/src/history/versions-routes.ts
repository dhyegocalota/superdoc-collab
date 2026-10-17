import { DocumentRole, HttpStatus, TimelineQueryParam, VERSION_FAILED_ERROR, VERSION_NOT_READY_ERROR, versionCollaborationPath, type VersionMarks, type VersionSummary, type VersionText } from '@superdoc-history/types';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireDocumentRole } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { VersionLookupKind } from './versions-service';

export const VERSION_MARKS_AROUND = 10;
export const RETRY_AFTER_SECONDS = 1;
const RETRY_AFTER_HEADER = 'Retry-After';
const INVALID_SEQUENCE_MESSAGE = 'sequence must be a non-negative integer';
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;
const aroundSchema = z.string().regex(NON_NEGATIVE_INTEGER_PATTERN).transform(Number);

export function createVersionsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  const retryHeaders = { [RETRY_AFTER_HEADER]: String(RETRY_AFTER_SECONDS) };

  routes.get('/:documentId/versions', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const parsed = aroundSchema.safeParse(context.req.query(TimelineQueryParam.Around));
    if (!parsed.success) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    const around = parsed.data;
    const marks = services.readModel.marks(documentId);
    const index = marks.findLastIndex((mark) => mark.sequence <= around);
    const centre = index === -1 ? 0 : index;
    const body: VersionMarks = { marks: marks.slice(Math.max(0, centre - VERSION_MARKS_AROUND), centre + VERSION_MARKS_AROUND + 1).map(({ sequence, serverTime }) => ({ sequence, serverTime })) };
    return context.json(body);
  });

  routes.get('/:documentId/versions/:sequence', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const sequenceText = context.req.param('sequence');
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(sequenceText)) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    const mark = services.versions.resolve({ documentId, sequence: Number(sequenceText) });
    if (!mark && services.scheduler.isRebuilding(documentId)) return context.json({ sequence: Number(sequenceText) }, HttpStatus.Accepted, retryHeaders);
    if (!mark) return context.json({ error: VERSION_NOT_READY_ERROR }, HttpStatus.Conflict);
    const lookup = services.versions.peek({ documentId, sequence: mark.sequence });
    if (lookup.kind === VersionLookupKind.Failed) return context.json({ error: VERSION_FAILED_ERROR }, HttpStatus.ServiceUnavailable, retryHeaders);
    if (lookup.kind === VersionLookupKind.Pending) return context.json({ sequence: mark.sequence }, HttpStatus.Accepted, retryHeaders);
    const summary: VersionSummary = { sequence: lookup.version.sequence, serverTime: lookup.version.serverTime, collaborationPath: versionCollaborationPath({ documentId, sequence: lookup.version.sequence }) };
    return context.json(summary);
  });

  routes.get('/:documentId/versions/:sequence/text', async (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const sequenceText = context.req.param('sequence');
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(sequenceText)) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    if (!services.versions.resolve({ documentId, sequence: Number(sequenceText) })) return context.json({ error: VERSION_NOT_READY_ERROR }, HttpStatus.Conflict);
    try {
      const { sequence, text } = await services.versions.load({ documentId, sequence: Number(sequenceText) });
      const body: VersionText = { sequence, text };
      return context.json(body);
    } catch {
      return context.json({ error: VERSION_FAILED_ERROR }, HttpStatus.ServiceUnavailable, retryHeaders);
    }
  });

  return routes;
}
