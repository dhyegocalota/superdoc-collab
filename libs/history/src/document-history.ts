import * as Y from 'yjs';
import type { LoggedUpdate } from './update-log';

const META_MAP = 'meta';
const BOOTSTRAP_STATE_KEY = 'bootstrapState';
const BOOTSTRAP_COMMITTED = 'committed';

export function findBootstrapSequence({ updates, document = new Y.Doc() }: { updates: LoggedUpdate[]; document?: Y.Doc }): number | null {
  const committed = updates.find((update) => {
    Y.applyUpdate(document, update.update);
    return document.getMap(META_MAP).get(BOOTSTRAP_STATE_KEY) === BOOTSTRAP_COMMITTED;
  });
  if (!committed) return null;
  return committed.sequence;
}
