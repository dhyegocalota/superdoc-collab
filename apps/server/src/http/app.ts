import { getConnInfo } from '@hono/node-server/conninfo';
import { ApiPath, HttpStatus } from '@superdoc-history/types';
import { Hono } from 'hono';
import type { Auth } from '../auth/auth';
import type { Environment } from '../config/environment';
import { withClientAddress } from './client-address';
import { health } from './health';
import { createMeHandler } from './me';

const UNKNOWN_CLIENT_ADDRESS_MESSAGE = 'Unknown client address';

export function createApp({ auth, environment }: { auth: Auth; environment: Environment }): Hono {
  const app = new Hono();
  app.get(ApiPath.Health, health);
  app.on(['GET', 'POST'], `${ApiPath.Auth}/*`, async (context) => {
    const remoteAddress = getConnInfo(context).remote.address;
    if (!remoteAddress) return context.json({ error: UNKNOWN_CLIENT_ADDRESS_MESSAGE }, HttpStatus.BadRequest);
    return auth.handler(withClientAddress({ request: context.req.raw, remoteAddress, trustProxy: environment.trustProxy }));
  });
  app.get(ApiPath.Me, createMeHandler({ auth }));
  return app;
}
