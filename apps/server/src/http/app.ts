import { getConnInfo } from '@hono/node-server/conninfo';
import { ApiPath, HttpStatus } from '@superdoc-history/types';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import type { AgentActionsLog, ReadModel, UpdateLog } from '@superdoc-history/history';
import type { Auth } from '../auth/auth';
import { mountOAuthDiscovery } from '../auth/oauth-discovery';
import type { AgentSessions } from '../agent/agent-sessions';
import type { AgentToolContext } from '../agent/agent-tool-context';
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
import { requireUser } from './require-user';

const UNKNOWN_CLIENT_ADDRESS_MESSAGE = 'Unknown client address';
const FORBIDDEN_MESSAGE = 'Forbidden';
export const NOT_FOUND_MESSAGE = 'Not found';
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
  agentActions: AgentActionsLog;
  agentSessions: AgentSessions;
  agentToolkit: AgentToolContext['toolkit'];
  readModel: ReadModel;
  insightsRepository: InsightsRepository;
  scheduler: ProjectionScheduler;
  timelinePipelines: TimelinePipelineCache;
  insights: InsightsServices;
  versions: VersionsService;
  versionRooms: VersionRooms;
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
  app.on(['GET', 'POST'], `${ApiPath.Auth}/*`, async (context) => {
    const remoteAddress = getConnInfo(context).remote.address;
    if (!remoteAddress) return context.json({ error: UNKNOWN_CLIENT_ADDRESS_MESSAGE }, HttpStatus.BadRequest);
    return auth.handler(withClientAddress({ request: context.req.raw, remoteAddress, trustProxy: environment.trustProxy }));
  });
  mountOAuthDiscovery({ app, auth });
  app.get(ApiPath.Me, createMeHandler({ auth }));
  app.route(ApiPath.Documents, createHistoryRoutes({ services }));
  app.route(ApiPath.Documents, createTimelineRoutes({ services }));
  app.route(ApiPath.Documents, createInsightsRoutes({ services }));
  app.route(ApiPath.Documents, createVersionsRoutes({ services }));
  app.route(ApiPath.Documents, createDocumentsRoutes({ services }));
  app.route('/', createShareLinksRoutes({ services }));
  return app;
}
