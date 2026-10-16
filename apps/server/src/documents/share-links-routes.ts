import { ApiPath, DocumentResource, DocumentRole, HttpStatus, INVALID_SHARE_LINK_MESSAGE, SHARE_LINK_GRANTS, ShareLinkRole } from '@superdoc-history/types';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { requireDocumentRole } from './require-document-role';

const INVALID_SHARE_LINK_ROLE_MESSAGE = 'The share link role must be edit or read';
const roleSchema = z.enum(ShareLinkRole);
const DOCUMENT_SHARE_LINKS_PATH = `${ApiPath.Documents}/:documentId/${DocumentResource.ShareLinks}`;

export function createShareLinksRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const { documents, shareLinks } = services;
  const routes = new Hono<SignedIn>();

  routes.get(DOCUMENT_SHARE_LINKS_PATH, (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents, documentId, userId: context.var.user.id, minimumRole: DocumentRole.Owner });
    return context.json(shareLinks.links(documentId));
  });

  routes.post(`${DOCUMENT_SHARE_LINKS_PATH}/:role/rotate`, (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents, documentId, userId: context.var.user.id, minimumRole: DocumentRole.Owner });
    const role = roleSchema.safeParse(context.req.param('role'));
    if (!role.success) return context.json({ error: INVALID_SHARE_LINK_ROLE_MESSAGE }, HttpStatus.BadRequest);
    return context.json(shareLinks.rotate({ documentId, role: role.data }));
  });

  routes.post(`${ApiPath.ShareLinks}/:token/accept`, (context) => {
    const resolved = shareLinks.resolve(context.req.param('token'));
    if (!resolved) return context.json({ error: INVALID_SHARE_LINK_MESSAGE }, HttpStatus.NotFound);
    documents.grant({ documentId: resolved.documentId, userId: context.var.user.id, role: SHARE_LINK_GRANTS[resolved.role] });
    return context.json({ documentId: resolved.documentId });
  });

  return routes;
}
