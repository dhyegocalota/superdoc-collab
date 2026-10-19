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
  type AnsweredRequestKind,
  type BlocksReply,
  type ProjectionDoneReply,
  type ProjectionRequestsByKind,
  type VersionReply,
} from './projection-messages';

type Handlers = { [Kind in AnsweredRequestKind]: (request: ProjectionRequestsByKind[Kind]) => AnsweredReply | Promise<AnsweredReply> };

type ProjectionStores = {
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
}: ProjectionStores): <Kind extends AnsweredRequestKind>(request: ProjectionRequestsByKind[Kind]) => Promise<AnsweredReply> {
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
    const serverTime = updateLog.serverTimeOf({ documentName: documentId, sequence });
    if (serverTime === null) throw new MissingVersionMarkError({ documentId, sequence });
    const version = replays.versionAt({ log: updateLog, documentName: documentId, sequence });
    return {
      kind: ProjectionRequestKind.Version,
      documentId,
      sequence,
      serverTime,
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

  const handlers: Handlers = {
    [ProjectionRequestKind.Project]: (request) => handleProject(request.documentId),
    [ProjectionRequestKind.Import]: handleImport,
    [ProjectionRequestKind.Forget]: (request) => handleForget(request.documentId),
    [ProjectionRequestKind.Version]: versionReply,
    [ProjectionRequestKind.Blocks]: (request) => blocksReply(request.documentId),
  };

  return async function handle<Kind extends AnsweredRequestKind>(request: ProjectionRequestsByKind[Kind]): Promise<AnsweredReply> {
    return handlers[request.kind](request);
  };
}
