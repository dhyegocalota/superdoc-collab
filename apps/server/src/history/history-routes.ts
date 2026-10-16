import { resolveAuthorIds, type StoredEditEvent } from '@superdoc-history/history';
import { DocumentRole, HttpStatus, type DocumentEditEvents, type EventAuthor } from '@superdoc-history/types';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireDocumentRole } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';

const INVALID_AFTER_SEQUENCE_MESSAGE = 'afterSequence must be a non-negative integer';
const afterSequenceSchema = z.coerce.number().int().nonnegative().optional();

export class IncompleteEditEventError extends Error {
  constructor(eventId: number) {
    super(`Edit event ${eventId} has no client ids or connection user.`);
  }
}

export class UnknownAuthorError extends Error {
  constructor(userId: string) {
    super(`Edit event author ${userId} is not a known user.`);
  }
}

function authorIdsOf({ event, identities }: { event: StoredEditEvent; identities: Map<number, string> }): string[] {
  const { yjsClientIds, connectionUserId } = event;
  if (event.imported) return [];
  if (yjsClientIds === null || connectionUserId === null) throw new IncompleteEditEventError(event.id);
  return resolveAuthorIds({ update: { yjsClientIds, connectionUserId }, identities });
}

function authorsOf({ event, authorIds, names }: { event: StoredEditEvent; authorIds: string[]; names: Map<string, string> }): EventAuthor[] {
  if (event.authorName !== null) return [{ id: null, name: event.authorName }];
  return authorIds.map((id) => {
    const name = names.get(id);
    if (!name) throw new UnknownAuthorError(id);
    return { id, name };
  });
}

function readDocumentEvents({ services, documentId, afterSequence }: { services: AppServices; documentId: string; afterSequence: number | null }): DocumentEditEvents {
  const identities = services.log.clientIdentities(documentId);
  const stored = services.readModel.read({ documentName: documentId, afterSequence });
  const resolved = stored.map((event) => ({ event, authorIds: authorIdsOf({ event, identities }) }));
  const names = services.documents.userNames([...new Set(resolved.flatMap(({ authorIds }) => authorIds))]);
  const events = resolved.map(({ event, authorIds }) => ({
    id: event.id,
    sequence: event.sequence,
    serverTime: event.serverTime,
    blockId: event.blockId,
    kind: event.kind,
    inserted: event.inserted,
    deleted: event.deleted,
    imported: event.imported,
    authors: authorsOf({ event, authorIds, names }),
  }));
  return { events, cursor: services.readModel.cursor(documentId) };
}

export function createHistoryRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/events', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const parsed = afterSequenceSchema.safeParse(context.req.query('afterSequence'));
    if (!parsed.success) return context.json({ error: INVALID_AFTER_SEQUENCE_MESSAGE }, HttpStatus.BadRequest);
    const afterSequence = parsed.data === undefined ? null : parsed.data;
    return context.json(readDocumentEvents({ services, documentId, afterSequence }));
  });
  return routes;
}
