import type { Block } from '@superdoc-collab/history';
import { SECOND_MS, type BootstrapLane } from '@superdoc-collab/types';

export const IMPORT_TIMEOUT_MS = 30 * SECOND_MS;
export const SNAPSHOT_EVERY_UPDATES = 1000;
export const IMPORT_FAILED_MESSAGE = 'Importing Word revisions failed for document';
export const IMPORT_TOO_LARGE_MESSAGE = 'Skipped importing Word revisions, the file is too large, for document';
export const IMPORT_SKIPPED_MESSAGE = 'Skipped importing Word revisions, projection is disabled, for document';
export const BOOTSTRAP_FAILED_MESSAGE = 'Bootstrapping the room failed for document';
export const WORKER_RECYCLED_MESSAGE = 'Recycled the projection worker after a heavy job, heap bytes:';
export const PROJECTION_FAILED_MESSAGE = 'Projecting edit events failed for document';

export enum ProjectionRequestKind {
  Project = 'project',
  Import = 'import',
  Forget = 'forget',
  Version = 'version',
  Blocks = 'blocks',
  Bootstrap = 'bootstrap',
  Stop = 'stop',
  Recycle = 'recycle',
  Measure = 'measure',
}

export type BootstrapRequest = { documentId: string; filePath: string; url: string; token: string; lane: BootstrapLane };

export type ProjectionRequest =
  | { kind: ProjectionRequestKind.Project; documentId: string }
  | { kind: ProjectionRequestKind.Import; documentId: string; filePath: string }
  | { kind: ProjectionRequestKind.Forget; documentId: string }
  | { kind: ProjectionRequestKind.Version; documentId: string; sequence: number }
  | { kind: ProjectionRequestKind.Blocks; documentId: string }
  | ({ kind: ProjectionRequestKind.Bootstrap } & BootstrapRequest)
  | { kind: ProjectionRequestKind.Stop }
  | { kind: ProjectionRequestKind.Recycle }
  | { kind: ProjectionRequestKind.Measure };

export enum ProjectionReplyKind {
  Failed = 'failed',
}

export type ProjectionDoneReply = {
  kind: ProjectionRequestKind.Project | ProjectionRequestKind.Import | ProjectionRequestKind.Forget;
  documentId: string;
  cursor: number | null;
  importError: string | null;
};
export type VersionReply = {
  kind: ProjectionRequestKind.Version;
  documentId: string;
  sequence: number;
  serverTime: number;
  state: Uint8Array;
  text: string;
};
export type BlocksReply = { kind: ProjectionRequestKind.Blocks; documentId: string; sequence: number; blocks: Block[] };
export type BootstrapReply = { kind: ProjectionRequestKind.Bootstrap; documentId: string };
type FailedReplyBase = { kind: ProjectionReplyKind.Failed; documentId: string; message: string };
export type ProjectionFailedReply = FailedReplyBase &
  (
    | { requestKind: ProjectionRequestKind.Version; sequence: number }
    | { requestKind: Exclude<ProjectionRequestKind, ProjectionRequestKind.Version>; sequence: null }
  );
export type AnsweredReply = ProjectionDoneReply | VersionReply | BlocksReply | BootstrapReply;
export type MeasureReply = { kind: ProjectionRequestKind.Measure; retainedHeapBytes: number };
export type ProjectionReply = AnsweredReply | MeasureReply | ProjectionFailedReply;
export type ProjectionRequestsByKind = { [Kind in ProjectionRequestKind]: Extract<ProjectionRequest, { kind: Kind }> };
export type AnsweredRequest = Exclude<
  ProjectionRequest,
  { kind: ProjectionRequestKind.Stop | ProjectionRequestKind.Recycle | ProjectionRequestKind.Measure }
>;
export type AnsweredRequestKind = AnsweredRequest['kind'];

export type ProjectionWorkerData = { databaseDirectory: string; hostHeapMegabytes: number | null };

export class ProjectionWorkerContextError extends Error {
  constructor() {
    super('The projection worker must run in a worker thread.');
  }
}

export class MissingVersionMarkError extends Error {
  override readonly name = 'MissingVersionMarkError';

  constructor({ documentId, sequence }: { documentId: string; sequence: number }) {
    super(`Document ${documentId} has no version mark at sequence ${sequence}.`);
  }
}

export class ProjectionStoppedError extends Error {
  constructor() {
    super('Projection is stopping.');
  }
}

export class ProjectionBusyError extends Error {
  constructor() {
    super('Too many version builds are waiting.');
  }
}

export class ProjectionRequestCrashedError extends Error {
  constructor() {
    super('The projection worker crashed twice while serving this request.');
  }
}

export class ProjectionDegradedError extends Error {
  constructor() {
    super('Projection is disabled until the server restarts.');
  }
}

export class BootstrapTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`The bootstrap took longer than ${milliseconds} ms.`);
  }
}

export class BootstrapInterruptedError extends Error {
  constructor() {
    super('The projection worker stopped during the bootstrap.');
  }
}

export class BootstrapNotAppliedError extends Error {
  constructor() {
    super('The SDK host opened the room without applying the document.');
  }
}

export class ImportTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`The import took longer than ${milliseconds} ms.`);
  }
}
