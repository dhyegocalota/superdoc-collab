import { BIN_LADDER_MS } from '@superdoc-history/history';
import { DocumentRole, FILTER_MAX_LENGTH, HttpStatus, TimelineQueryParam } from '@superdoc-history/types';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireDocumentRole } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { buildBinEdits, buildDocumentTimeline } from './timeline-service';

const INVALID_TIMELINE_QUERY_MESSAGE = 'The timeline query is invalid';
const EDITS_PATH = '/:documentId/timeline/edits';
const filterText = z.string().trim().max(FILTER_MAX_LENGTH).optional().transform((value) => (value ? value : null));
const binMsParameter = z.coerce.number().int().refine((value) => BIN_LADDER_MS.includes(value)).optional().transform((value) => (value === undefined ? null : value));
const timelineQuerySchema = z.object({ [TimelineQueryParam.Term]: filterText, [TimelineQueryParam.Author]: filterText, [TimelineQueryParam.BinMs]: binMsParameter });
const editsQuerySchema = timelineQuerySchema.extend({ [TimelineQueryParam.BinStart]: z.coerce.number().int() });

function queryOf({ read, names }: { read: (name: string) => string | undefined; names: string[] }): Record<string, string | undefined> {
  return Object.fromEntries(names.map((name) => [name, read(name)]));
}

export function createTimelineRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/timeline', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const parsed = timelineQuerySchema.safeParse(queryOf({ read: (name) => context.req.query(name), names: Object.keys(timelineQuerySchema.shape) }));
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const { term, author, binMs } = parsed.data;
    return context.json(buildDocumentTimeline({ services, documentId, filter: { term, author }, binMs }));
  });
  routes.get(EDITS_PATH, (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const parsed = editsQuerySchema.safeParse(queryOf({ read: (name) => context.req.query(name), names: Object.keys(editsQuerySchema.shape) }));
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const { term, author, binMs, binStart } = parsed.data;
    return context.json(buildBinEdits({ services, documentId, filter: { term, author }, binStart, binMs }));
  });
  return routes;
}
