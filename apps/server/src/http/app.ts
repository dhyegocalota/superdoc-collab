import { getConnInfo } from '@hono/node-server/conninfo';
import { ApiPath, HttpStatus } from '@superdoc-collab/types';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import type { ReadModel, UpdateLog } from '@superdoc-collab/history';
import { createAdminRoutes } from '../admin/admin-routes';
import { createInviteRoutes } from '../admin/invite-routes';
import type { InvitesRepository } from '../admin/invites';
import { createSetupRoutes } from '../admin/setup-routes';
import type { AdminUsersRepository } from '../admin/users';
import type { Auth } from '../auth/auth';
import type { Environment } from '../config/environment';
import type { DocumentRuntime } from '../collaboration/collaboration-runtime';
import type { DocumentsRepository } from '../documents/documents-repository';
import { createDocumentsRoutes } from '../documents/documents-routes';
import type { DocumentFileStorage } from '../documents/file-storage';
import { createShareLinksRoutes } from '../documents/share-links-routes';
import type { ShareLinksRepository } from '../documents/share-links';
import { DocumentNotFoundError, DocumentRoleTooLowError } from '../documents/require-document-role';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { TimelinePipelineCache } from '../history/timeline-pipeline-cache';
import { createInsightsRoutes } from '../insights/insights-routes';
import type { InsightsJobRunner } from '../insights/insights-job-runner';
import type { SelectionSummariesService } from '../insights/selection-summaries-service';
import type { SummariesService } from '../insights/summaries-service';
import type { TopicsService } from '../insights/topics-service';
import type { InsightsRepository } from '../insights/insights-repository';
import { createHistoryRoutes } from '../history/history-routes';
import { createVersionsRoutes } from '../history/versions-routes';
import type { VersionsService } from '../history/versions-service';
import type { VersionRooms } from '../collaboration/version-rooms';
import { createTimelineRoutes } from '../history/timeline-routes';
import { withClientAddress } from './client-address';
import { health } from './health';
import { createMeHandler } from './me';
import { requireAdmin } from './require-admin';
import { requireUser } from './require-user';

const UNKNOWN_CLIENT_ADDRESS_MESSAGE = 'Unknown client address';
const FORBIDDEN_MESSAGE = 'Forbidden';
export const NOT_FOUND_MESSAGE = 'Not found';
const AUTH_ADMIN_PATH = `${ApiPath.Auth}/admin/*`;
const PROTECTED_PATHS = [ApiPath.Documents, `${ApiPath.Documents}/*`, `${ApiPath.ShareLinks}/*`];

export type InsightsServices = {
  topics: TopicsService;
  summaries: SummariesService;
  selection: SelectionSummariesService;
  jobRunner: InsightsJobRunner;
};

export type AppServices = {
  documents: DocumentsRepository;
  storage: DocumentFileStorage;
  runtime: DocumentRuntime;
  shareLinks: ShareLinksRepository;
  updateLog: UpdateLog;
  readModel: ReadModel;
  insightsRepository: InsightsRepository;
  scheduler: ProjectionScheduler;
  timelinePipelines: TimelinePipelineCache;
  insights: InsightsServices;
  versions: VersionsService;
  versionRooms: VersionRooms;
  invites: InvitesRepository;
  adminUsers: AdminUsersRepository;
};

export function createApp({ auth, environment, services }: { auth: Auth; environment: Environment; services: AppServices }): Hono {
  const app = new Hono();
  const signedIn = requireUser({ auth });
  const sameOriginOnly = csrf({ origin: environment.appOrigin });
  PROTECTED_PATHS.forEach((path) => app.use(path, sameOriginOnly, signedIn));
  app.onError((error, context) => {
    if (error instanceof DocumentNotFoundError) return context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    if (error instanceof DocumentRoleTooLowError) return context.json({ error: FORBIDDEN_MESSAGE }, HttpStatus.Forbidden);
    if (error instanceof HTTPException) return error.getResponse();
    throw error;
  });
  app.get(ApiPath.Health, health);
  app.all(AUTH_ADMIN_PATH, (context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  app.on(['GET', 'POST'], `${ApiPath.Auth}/*`, async (context) => {
    const remoteAddress = getConnInfo(context).remote.address;
    if (!remoteAddress) return context.json({ error: UNKNOWN_CLIENT_ADDRESS_MESSAGE }, HttpStatus.BadRequest);
    return auth.handler(withClientAddress({ request: context.req.raw, remoteAddress, trustProxy: environment.trustProxy }));
  });
  app.get(ApiPath.Me, createMeHandler({ auth }));
  app.route('/', createSetupRoutes({ services }));
  app.route('/', createInviteRoutes({ services }));
  app.use(`${ApiPath.Admin}/*`, sameOriginOnly, signedIn, requireAdmin());
  app.route(ApiPath.Admin, createAdminRoutes({ services }));
  app.route(ApiPath.Documents, createHistoryRoutes({ services }));
  app.route(ApiPath.Documents, createTimelineRoutes({ services }));
  app.route(ApiPath.Documents, createInsightsRoutes({ services }));
  app.route(ApiPath.Documents, createVersionsRoutes({ services }));
  app.route(ApiPath.Documents, createDocumentsRoutes({ services }));
  app.route('/', createShareLinksRoutes({ services }));
  return app;
}
