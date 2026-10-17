import { ApiPath } from '@superdoc-history/types';
import { Hono } from 'hono';
import type { AppServices } from '../http/app';

export function createSetupRoutes({ services }: { services: AppServices }): Hono {
  const routes = new Hono();
  routes.get(ApiPath.Setup, (context) => context.json({ claimed: services.invites.hasAnyUser() }));
  return routes;
}
