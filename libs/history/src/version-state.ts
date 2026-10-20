import type * as Y from 'yjs';
import { materialize, type UpdateLog } from './update-log';

export function versionAt({ log, documentName, sequence }: { log: UpdateLog; documentName: string; sequence: number }): Y.Doc {
  return materialize({ log, documentName, untilSequence: sequence });
}
