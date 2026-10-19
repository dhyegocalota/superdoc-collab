import {
  DocumentRole,
  HttpStatus,
  NON_NEGATIVE_INTEGER_PATTERN,
  RETRY_AFTER_SECONDS,
  SECOND_MS,
  TimelineQueryParam,
  VERSION_BUSY_ERROR,
  VERSION_FAILED_ERROR,
  VERSION_THROTTLED_ERROR,
  VERSION_NOT_READY_ERROR,
  versionCollaborationPath,
  type VersionMarks,
  type VersionSummary,
  type VersionText,
} from '@superdoc-collab/types';
import { Hono } from 'hono';
import { z } from 'zod';
import { authorizedDocumentId } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { retryLater, type RetryLaterOptions } from '../http/retry-later';
import { ProjectionBusyError } from './projection-messages';
import { marksAround, VersionLookupKind, VersionThrottledError } from './versions-service';

const INVALID_SEQUENCE_MESSAGE = 'sequence must be a non-negative integer';
const aroundSchema = z.string().regex(NON_NEGATIVE_INTEGER_PATTERN).transform(Number);

function retryVersionLater(retry: Omit<RetryLaterOptions, 'retryAfterSeconds'>): Response {
  return retryLater({ ...retry, retryAfterSeconds: RETRY_AFTER_SECONDS });
}

type RouteMount = { routes: Hono<SignedIn>; services: AppServices };

function mountMarks({ routes, services }: RouteMount): void {
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
}

function mountSummary({ routes, services }: RouteMount): void {
  routes.get('/:documentId/versions/:sequence', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const sequenceText = context.req.param('sequence');
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(sequenceText)) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    const mark = services.versions.resolve({ documentId, sequence: Number(sequenceText) });
    if (!mark && services.scheduler.isRebuilding(documentId))
      return retryVersionLater({
        context,
        body: { sequence: Number(sequenceText) },
        status: HttpStatus.Accepted,
      });
    if (!mark) return context.json({ error: VERSION_NOT_READY_ERROR }, HttpStatus.Conflict);
    const lookup = services.versions.peek({ documentId, sequence: mark.sequence, userId: context.get('user').id });
    if (lookup.kind === VersionLookupKind.Failed)
      return retryVersionLater({
        context,
        body: { error: VERSION_FAILED_ERROR },
        status: HttpStatus.ServiceUnavailable,
      });
    if (lookup.kind === VersionLookupKind.Busy)
      return retryVersionLater({
        context,
        body: { error: VERSION_BUSY_ERROR },
        status: HttpStatus.ServiceUnavailable,
      });
    if (lookup.kind === VersionLookupKind.Throttled)
      return retryLater({
        context,
        body: { error: VERSION_THROTTLED_ERROR },
        status: HttpStatus.TooManyRequests,
        retryAfterSeconds: Math.ceil(lookup.retryAfterMs / SECOND_MS),
      });
    if (lookup.kind === VersionLookupKind.Pending)
      return retryVersionLater({
        context,
        body: { sequence: mark.sequence },
        status: HttpStatus.Accepted,
      });
    const summary: VersionSummary = {
      sequence: lookup.version.sequence,
      serverTime: lookup.version.serverTime,
      collaborationPath: versionCollaborationPath({ documentId, sequence: lookup.version.sequence }),
    };
    return context.json(summary);
  });
}

function mountText({ routes, services }: RouteMount): void {
  routes.get('/:documentId/versions/:sequence/text', async (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const sequenceText = context.req.param('sequence');
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(sequenceText)) return context.json({ error: INVALID_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    if (!services.versions.resolve({ documentId, sequence: Number(sequenceText) }))
      return context.json({ error: VERSION_NOT_READY_ERROR }, HttpStatus.Conflict);
    try {
      const { sequence, text } = await services.versions.load({
        documentId,
        sequence: Number(sequenceText),
        userId: context.get('user').id,
      });
      const body: VersionText = { sequence, text };
      return context.json(body);
    } catch (error) {
      if (error instanceof VersionThrottledError)
        return retryLater({
          context,
          body: { error: VERSION_THROTTLED_ERROR },
          status: HttpStatus.TooManyRequests,
          retryAfterSeconds: Math.ceil(error.retryAfterMs / SECOND_MS),
        });
      if (error instanceof ProjectionBusyError)
        return retryVersionLater({
          context,
          body: { error: VERSION_BUSY_ERROR },
          status: HttpStatus.ServiceUnavailable,
        });
      return retryVersionLater({
        context,
        body: { error: VERSION_FAILED_ERROR },
        status: HttpStatus.ServiceUnavailable,
      });
    }
  });
}

export function createVersionsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  mountMarks({ routes, services });
  mountSummary({ routes, services });
  mountText({ routes, services });
  return routes;
}
