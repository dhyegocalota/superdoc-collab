import { getConnInfo } from '@hono/node-server/conninfo';
import { ApiPath, HttpStatus } from '@superdoc-history/types';
import { Hono } from 'hono';
import type { ReadModel, UpdateLog } from '@superdoc-history/history';
import type { Auth } from '../auth/auth';
import type { Environment } from '../config/environment';
import type { DocumentRuntime } from '../collaboration/collaboration-runtime';
import type { DocumentsRepository } from '../documents/documents-repository';
import { createDocumentsRoutes } from '../documents/documents-routes';
import type { DocumentFileStorage } from '../documents/file-storage';
import { DocumentNotFoundError, DocumentRoleTooLowError } from '../documents/require-document-role';
import { createHistoryRoutes } from '../history/history-routes';
import { NOT_FOUND_MESSAGE } from '../server';
import { withClientAddress } from './client-address';
import { health } from './health';
import { createMeHandler } from './me';
import { requireUser } from './require-user';

const UNKNOWN_CLIENT_ADDRESS_MESSAGE = 'Unknown client address';
const FORBIDDEN_MESSAGE = 'Forbidden';

export type AppServices = { documents: DocumentsRepository; storage: DocumentFileStorage; runtime: DocumentRuntime; log: UpdateLog; readModel: ReadModel };

export function createApp({ auth, environment, services }: { auth: Auth; environment: Environment; services: AppServices }): Hono {
  const app = new Hono();
  const signedIn = requireUser({ auth });
  app.use(ApiPath.Documents, signedIn);
  app.use(`${ApiPath.Documents}/*`, signedIn);
  app.use(`${ApiPath.ShareLinks}/*`, signedIn);
  app.onError((error, context) => {
    if (error instanceof DocumentNotFoundError) return context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    if (error instanceof DocumentRoleTooLowError) return context.json({ error: FORBIDDEN_MESSAGE }, HttpStatus.Forbidden);
    throw error;
  });
  app.get(ApiPath.Health, health);
  app.on(['GET', 'POST'], `${ApiPath.Auth}/*`, async (context) => {
    const remoteAddress = getConnInfo(context).remote.address;
    if (!remoteAddress) return context.json({ error: UNKNOWN_CLIENT_ADDRESS_MESSAGE }, HttpStatus.BadRequest);
    return auth.handler(withClientAddress({ request: context.req.raw, remoteAddress, trustProxy: environment.trustProxy }));
  });
  app.get(ApiPath.Me, createMeHandler({ auth }));
  app.route(ApiPath.Documents, createHistoryRoutes({ services }));
  app.route(ApiPath.Documents, createDocumentsRoutes(services));
  return app;
}
