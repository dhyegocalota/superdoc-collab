export const IMPORT_TIMEOUT_MS = 30_000;
export const IMPORT_FAILED_MESSAGE = 'Importing Word revisions failed for document';
export const PROJECTION_FAILED_MESSAGE = 'Projecting edit events failed for document';

export enum ProjectionRequestKind {
  Project = 'project',
  Import = 'import',
  Forget = 'forget',
  Stop = 'stop',
}

export type ProjectionRequest =
  | { kind: ProjectionRequestKind.Project; documentId: string }
  | { kind: ProjectionRequestKind.Import; documentId: string; filePath: string }
  | { kind: ProjectionRequestKind.Forget; documentId: string }
  | { kind: ProjectionRequestKind.Stop };

export enum ProjectionReplyKind {
  Failed = 'failed',
}

export type ProjectionDoneReply = { kind: ProjectionRequestKind; documentId: string; cursor: number | null; importError: string | null };
export type ProjectionFailedReply = { kind: ProjectionReplyKind.Failed; documentId: string; message: string };
export type ProjectionReply = ProjectionDoneReply | ProjectionFailedReply;

export type ProjectionWorkerData = { databaseDirectory: string };

export class ProjectionWorkerContextError extends Error {
  constructor() {
    super('The projection worker must run in a worker thread.');
  }
}

export class ImportTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`The import took longer than ${milliseconds} ms.`);
  }
}
