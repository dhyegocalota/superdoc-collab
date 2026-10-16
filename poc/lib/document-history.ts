import * as Y from 'yjs';
import { readMainStoryText } from './document-content';
import { projectEditEvents, type EditEvent } from './edit-events';
import { materialize, type LoggedUpdate, type UpdateLog } from './update-log';

const META_MAP = 'meta';
const BOOTSTRAP_STATE_KEY = 'bootstrapState';
const BOOTSTRAP_COMMITTED = 'committed';

export function findBootstrapSequence(updates: LoggedUpdate[]): number {
  const document = new Y.Doc();
  const committed = updates.find((update) => {
    Y.applyUpdate(document, update.update);
    return document.getMap(META_MAP).get(BOOTSTRAP_STATE_KEY) === BOOTSTRAP_COMMITTED;
  });
  if (!committed) throw new Error('The room bootstrap never committed.');
  return committed.sequence;
}

export function readEditEvents({ log, documentName }: { log: UpdateLog; documentName: string }): EditEvent[] {
  const updates = log.read({ documentName, untilSequence: Number.MAX_SAFE_INTEGER });
  const bootstrapSequence = findBootstrapSequence(updates);
  return projectEditEvents({
    baseline: updates.filter((update) => update.sequence <= bootstrapSequence),
    updates: updates.filter((update) => update.sequence > bootstrapSequence),
    identities: log.clientIdentities(documentName),
  });
}

export function readTextAtSequence({ log, documentName, sequence }: { log: UpdateLog; documentName: string; sequence: number }): string {
  return readMainStoryText(materialize({ log, documentName, untilSequence: sequence }));
}
