import * as Y from 'yjs';
import type { LoggedUpdate } from './update-log';

const META_MAP = 'meta';
const BOOTSTRAP_STATE_KEY = 'bootstrapState';
const BOOTSTRAP_COMMITTED = 'committed';

export function isBootstrapCommitted({ document }: { document: Y.Doc }): boolean {
  return document.getMap(META_MAP).get(BOOTSTRAP_STATE_KEY) === BOOTSTRAP_COMMITTED;
}

export function findBootstrapSequence({ updates, document = new Y.Doc() }: { updates: LoggedUpdate[]; document?: Y.Doc }): number | null {
  const committed = updates.find((update) => {
    Y.applyUpdate(document, update.update);
    return isBootstrapCommitted({ document });
  });
  if (!committed) return null;
  return committed.sequence;
}
