import * as Y from 'yjs';
import { findBootstrapSequence } from './document-history';
import { projectEditEvents } from './edit-events';
import type { ReadModel } from './read-model';
import { materialize, type UpdateLog } from './update-log';

export const PROJECTION_BATCH_SIZE = 2000;

type Projection = { log: UpdateLog; readModel: ReadModel; documentName: string; batchSize: number };

function continueProjection({ projection, cursor }: { projection: Projection; cursor: number }): number {
  const { log, readModel, documentName, batchSize } = projection;
  const batch = log.readBatch({ documentName, afterSequence: cursor, limit: batchSize });
  const last = batch.at(-1);
  if (!last) return cursor;
  const baselineState = Y.encodeStateAsUpdate(materialize({ log, documentName, untilSequence: cursor }));
  const events = projectEditEvents({ baselineState, updates: batch });
  readModel.commit({ documentName, events, lastSequence: last.sequence });
  return continueProjection({ projection, cursor: last.sequence });
}

export function projectPending({ log, readModel, documentName, batchSize = PROJECTION_BATCH_SIZE }: { log: UpdateLog; readModel: ReadModel; documentName: string; batchSize?: number }): number | null {
  const projection = { log, readModel, documentName, batchSize };
  const cursor = readModel.cursor(documentName);
  if (cursor !== null) return continueProjection({ projection, cursor });
  const bootstrapSequence = findBootstrapSequence(log.read({ documentName, untilSequence: Number.MAX_SAFE_INTEGER }));
  if (bootstrapSequence === null) return null;
  readModel.commit({ documentName, events: [], lastSequence: bootstrapSequence });
  return continueProjection({ projection, cursor: bootstrapSequence });
}
