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

function bootstrapMark({ log, documentName, sequence }: { log: UpdateLog; documentName: string; sequence: number }): VersionMark {
  const [update] = log.readRange({ documentName, afterSequence: sequence - 1, untilSequence: sequence });
  if (!update) throw new MissingBootstrapUpdateError(sequence);
  return markOf({ update, document: materialize({ log, documentName, untilSequence: sequence }), isBootstrap: true });
}

function previewAt({ log, documentName, sequence }: { log: UpdateLog; documentName: string; sequence: number }): string {
  return readMainStoryBlocks(materialize({ log, documentName, untilSequence: sequence }))
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

function continueProjection({ projection, cursor }: { projection: Projection; cursor: number }): number {
  const { log, readModel, documentName, batchSize } = projection;
  const batch = log.readBatch({ documentName, afterSequence: cursor, limit: batchSize });
  const last = batch.at(-1);
  if (!last) return cursor;
  const baselineState = Y.encodeStateAsUpdate(materialize({ log, documentName, untilSequence: cursor }));
  const { events, marks } = projectEditEvents({ baselineState, updates: batch });
  readModel.commit({
    documentName,
    events,
    marks,
    lastSequence: last.sequence,
    preview: previewAt({ log, documentName, sequence: last.sequence }),
  });
  return continueProjection({ projection, cursor: last.sequence });
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
  if (cursor !== null) return continueProjection({ projection, cursor });
  const bootstrapSequence = findBootstrapStart({ log, documentName });
  if (bootstrapSequence === null) return null;
  readModel.commit({
    documentName,
    events: [],
    marks: [bootstrapMark({ log, documentName, sequence: bootstrapSequence })],
    lastSequence: bootstrapSequence,
    preview: previewAt({ log, documentName, sequence: bootstrapSequence }),
  });
  return continueProjection({ projection, cursor: bootstrapSequence });
}
