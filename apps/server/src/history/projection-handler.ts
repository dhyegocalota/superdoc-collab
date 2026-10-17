import {
  compact,
  materialize,
  projectPending,
  readMainStoryBlocks,
  readMainStoryText,
  type GcFreeReplays,
  type ReadModel,
  type UpdateLog,
} from '@superdoc-collab/history';
import * as Y from 'yjs';
import {
  MissingVersionMarkError,
  ProjectionRequestKind,
  SNAPSHOT_EVERY_UPDATES,
  type AnsweredReply,
  type AnsweredRequest,
  type BlocksReply,
  type ProjectionDoneReply,
  type VersionReply,
} from './projection-messages';

export type ProjectionStores = {
  updateLog: UpdateLog;
  readModel: ReadModel;
  replays: GcFreeReplays;
  importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null>;
};

export function createProjectionHandler({
  updateLog,
  readModel,
  replays,
  importRevisions,
}: ProjectionStores): (request: AnsweredRequest) => Promise<AnsweredReply> {
  function handleProject(documentId: string): ProjectionDoneReply {
    compact({ log: updateLog, documentName: documentId, everyUpdates: SNAPSHOT_EVERY_UPDATES });
    return {
      kind: ProjectionRequestKind.Project,
      documentId,
      cursor: projectPending({ log: updateLog, readModel, documentName: documentId }),
      importError: null,
    };
  }

  async function handleImport(request: { documentId: string; filePath: string }): Promise<ProjectionDoneReply> {
    const cursor = readModel.cursor(request.documentId);
    return { kind: ProjectionRequestKind.Import, documentId: request.documentId, cursor, importError: await importRevisions(request) };
  }

  function handleForget(documentId: string): ProjectionDoneReply {
    replays.forget(documentId);
    readModel.forget(documentId);
    return { kind: ProjectionRequestKind.Forget, documentId, cursor: readModel.cursor(documentId), importError: null };
  }

  function versionReply({ documentId, sequence }: { documentId: string; sequence: number }): VersionReply {
    const mark = readModel.mark({ documentName: documentId, sequence });
    if (!mark) throw new MissingVersionMarkError({ documentId, sequence });
    const version = replays.version({ log: updateLog, documentName: documentId, mark });
    return {
      kind: ProjectionRequestKind.Version,
      documentId,
      sequence,
      serverTime: mark.serverTime,
      state: Y.encodeStateAsUpdate(version),
      text: readMainStoryText(version),
    };
  }

  function blocksReply(documentId: string): BlocksReply {
    const cursor = readModel.cursor(documentId);
    if (cursor === null) return { kind: ProjectionRequestKind.Blocks, documentId, sequence: 0, blocks: [] };
    return {
      kind: ProjectionRequestKind.Blocks,
      documentId,
      sequence: cursor,
      blocks: readMainStoryBlocks(materialize({ log: updateLog, documentName: documentId, untilSequence: cursor })),
    };
  }

  return async function handle(request: AnsweredRequest): Promise<AnsweredReply> {
    if (request.kind === ProjectionRequestKind.Version) return versionReply(request);
    if (request.kind === ProjectionRequestKind.Blocks) return blocksReply(request.documentId);
    if (request.kind === ProjectionRequestKind.Import) return handleImport(request);
    if (request.kind === ProjectionRequestKind.Forget) return handleForget(request.documentId);
    return handleProject(request.documentId);
  };
}
