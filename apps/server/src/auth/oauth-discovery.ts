import type { Hono } from 'hono';
import type { Auth } from './auth';

const DISCOVERY_PATTERN = '/.well-known/*';

export function mountOAuthDiscovery({ app, auth }: { app: Hono; auth: Auth }): void {
  app.get(DISCOVERY_PATTERN, (context) => auth.handler(context.req.raw));
}
