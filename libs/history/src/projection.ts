import { PREVIEW_MAX_CHARACTERS } from '@superdoc-collab/types';
import * as Y from 'yjs';
import { readMainStoryBlocks } from './document-content';
import { findBootstrapSequence, findCommittedSnapshot } from './document-history';
import { projectEditEvents } from './edit-events';
import type { ReadModel } from './read-model';
import { materialize, type UpdateLog } from './update-log';
import { markOf, type VersionMark } from './version-marks';

const PROJECTION_BATCH_SIZE = 2000;

class MissingBootstrapUpdateError extends Error {
  constructor(sequence: number) {
    super(`Bootstrap update ${sequence} is missing from the log.`);
  }
}

type Projection = { log: UpdateLog; readModel: ReadModel; documentName: string; batchSize: number };

function bootstrapMark({
  log,
  documentName,
  sequence,
  document,
}: {
  log: UpdateLog;
  documentName: string;
  sequence: number;
  document: Y.Doc;
}): VersionMark {
  const [update] = log.readRange({ documentName, afterSequence: sequence - 1, untilSequence: sequence });
  if (!update) throw new MissingBootstrapUpdateError(sequence);
  return markOf({ update, document, isBootstrap: true });
}

function previewOf(document: Y.Doc): string {
  return readMainStoryBlocks(document)
    .filter((block) => block.mergedIntoBlockId === null)
    .map((block) => block.text)
    .join('\n')
    .slice(0, PREVIEW_MAX_CHARACTERS);
}

function findBootstrapStart({ log, documentName }: { log: UpdateLog; documentName: string }): number | null {
  const snapshot = findCommittedSnapshot({ log, documentName });
  if (snapshot) return snapshot.sequence;
  return findBootstrapSequence({ updates: log.read({ documentName, untilSequence: Number.MAX_SAFE_INTEGER }) });
}

function documentAt({ projection, cursor, document }: { projection: Projection; cursor: number; document: Y.Doc | null }): Y.Doc {
  if (document) return document;
  return materialize({ log: projection.log, documentName: projection.documentName, untilSequence: cursor });
}

function backfillPreview({ projection, cursor, document }: { projection: Projection; cursor: number; document: Y.Doc | null }): number {
  const { readModel, documentName } = projection;
  if (readModel.previews([documentName]).has(documentName)) return cursor;
  readModel.commit({
    documentName,
    events: [],
    marks: [],
    lastSequence: cursor,
    preview: previewOf(documentAt({ projection, cursor, document })),
  });
  return cursor;
}

function continueProjection({ projection, cursor, document }: { projection: Projection; cursor: number; document: Y.Doc | null }): number {
  const { log, readModel, documentName, batchSize } = projection;
  const batch = log.readBatch({ documentName, afterSequence: cursor, limit: batchSize });
  const last = batch.at(-1);
  if (!last) return backfillPreview({ projection, cursor, document });
  const projected = documentAt({ projection, cursor, document });
  const { events, marks } = projectEditEvents({ document: projected, updates: batch });
  readModel.commit({
    documentName,
    events,
    marks,
    lastSequence: last.sequence,
    preview: previewOf(projected),
  });
  return continueProjection({ projection, cursor: last.sequence, document: projected });
}

export function projectPending({
  log,
  readModel,
  documentName,
  batchSize = PROJECTION_BATCH_SIZE,
}: {
  log: UpdateLog;
  readModel: ReadModel;
  documentName: string;
  batchSize?: number;
}): number | null {
  const projection = { log, readModel, documentName, batchSize };
  const cursor = readModel.cursor(documentName);
  if (cursor !== null) return continueProjection({ projection, cursor, document: null });
  const bootstrapSequence = findBootstrapStart({ log, documentName });
  if (bootstrapSequence === null) return null;
  const document = materialize({ log, documentName, untilSequence: bootstrapSequence });
  readModel.commit({
    documentName,
    events: [],
    marks: [bootstrapMark({ log, documentName, sequence: bootstrapSequence, document })],
    lastSequence: bootstrapSequence,
    preview: previewOf(document),
  });
  return continueProjection({ projection, cursor: bootstrapSequence, document });
}
