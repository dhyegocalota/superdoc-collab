import { DocumentResource, DocumentRole, HttpStatus, publicFlagSchema, type PublicFlag } from '@superdoc-collab/types';
import { Hono } from 'hono';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { authorizedDocumentId } from './require-document-role';

const INVALID_PUBLIC_FLAG_MESSAGE = 'The public flag must be true or false';
const PUBLIC_PATH = `/:documentId/${DocumentResource.Public}`;

export function createPublicLinkRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const { documents, publicConnections } = services;
  const routes = new Hono<SignedIn>();

  routes.get(PUBLIC_PATH, (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Owner });
    const flag: PublicFlag = { isPublic: documents.isPublic(documentId) };
    return context.json(flag);
  });

  routes.put(PUBLIC_PATH, async (context) => {
    const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Owner });
    const parsed = publicFlagSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: INVALID_PUBLIC_FLAG_MESSAGE }, HttpStatus.BadRequest);
    documents.setPublic({ documentId, isPublic: parsed.data.isPublic });
    if (!parsed.data.isPublic) publicConnections.close(documentId);
    return context.json(parsed.data);
  });

  return routes;
}
