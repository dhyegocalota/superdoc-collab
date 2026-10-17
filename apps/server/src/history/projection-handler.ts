import type { GcFreeReplays, ReadModel, UpdateLog } from '@superdoc-history/history';
import type { BlocksReply, ProjectionDoneReply, ProjectionRequest, ProjectionRequestKind, VersionReply } from './projection-messages';

export type ProjectionStores = {
  updateLog: UpdateLog;
  readModel: ReadModel;
  replays: GcFreeReplays;
  importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null>;
};

export function createProjectionHandler(
  stores: ProjectionStores,
): (
  request: Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>,
) => Promise<ProjectionDoneReply | VersionReply | BlocksReply> {
  return async function handle(request) {
    throw new Error(`createProjectionHandler is not implemented: ${request.kind} ${Object.keys(stores)}`);
  };
}
