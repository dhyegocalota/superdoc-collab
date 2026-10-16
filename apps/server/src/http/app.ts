import { ApiPath } from '@superdoc-history/types';
import { Hono } from 'hono';
import type { Auth } from '../auth/auth';
import { health } from './health';
import { createMeHandler } from './me';

export function createApp({ auth }: { auth: Auth }): Hono {
  const app = new Hono();
  app.get(ApiPath.Health, health);
  app.on(['GET', 'POST'], `${ApiPath.Auth}/*`, (context) => auth.handler(context.req.raw));
  app.get(ApiPath.Me, createMeHandler({ auth }));
  return app;
}
