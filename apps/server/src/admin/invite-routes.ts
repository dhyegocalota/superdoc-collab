import { ApiPath, HttpStatus, INVITE_NOT_FOUND_MESSAGE, InviteState } from '@superdoc-history/types';
import { Hono } from 'hono';
import type { AppServices } from '../http/app';

export function createInviteRoutes({ services }: { services: AppServices }): Hono {
  const routes = new Hono();
  routes.get(`${ApiPath.Invites}/:token`, (context) => {
    const pending = services.invites.resolvePending(context.req.param('token'));
    if (!pending) return context.json({ error: INVITE_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    return context.json({ state: InviteState.Pending });
  });
  return routes;
}
