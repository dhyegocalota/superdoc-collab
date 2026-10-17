import { ApiPath, HttpStatus, INVITE_NOT_FOUND_MESSAGE, INVITE_TOKEN_HEADER, InviteState } from '@superdoc-collab/types';
import { Hono } from 'hono';
import type { AppServices } from '../http/app';

export function createInviteRoutes({ services }: { services: AppServices }): Hono {
  const routes = new Hono();
  routes.get(ApiPath.Invites, (context) => {
    const token = context.req.header(INVITE_TOKEN_HEADER);
    if (!token) return context.json({ error: INVITE_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    const pending = services.invites.resolvePending(token);
    if (!pending) return context.json({ error: INVITE_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    return context.json({ state: InviteState.Pending });
  });
  return routes;
}
