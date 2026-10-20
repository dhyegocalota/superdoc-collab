import * as Y from 'yjs';
import type { UpdateLog } from './update-log';

export const REPLAY_CACHE_SIZE = 2;

type Replay = { document: Y.Doc; lastSequence: number };

export class GcFreeReplays {
  private readonly capacity: number;
  private readonly replays = new Map<string, Replay>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  versionAt({ log, documentName, sequence }: { log: UpdateLog; documentName: string; sequence: number }): Y.Doc {
    const snapshot = log.latestSnapshot({ documentName, atOrBefore: sequence });
    const baseStates = snapshot ? [snapshot.state] : [];
    const tail = log.readRange({ documentName, afterSequence: snapshot ? snapshot.sequence : 0, untilSequence: sequence });
    const merged = Y.mergeUpdates([...baseStates, ...tail.map((update) => update.update)]);
    const versionSnapshot = new Y.Snapshot(Y.decodeUpdate(merged).ds, Y.decodeStateVector(Y.encodeStateVectorFromUpdate(merged)));
    return Y.createDocFromSnapshot(this.caughtUp({ log, documentName }), versionSnapshot);
  }

  forget(documentName: string): void {
    this.replays.delete(documentName);
  }

  private replayOf(documentName: string): Replay {
    const cached = this.replays.get(documentName);
    if (cached) return cached;
    return { document: new Y.Doc({ gc: false }), lastSequence: 0 };
  }

  private caughtUp({ log, documentName }: { log: UpdateLog; documentName: string }): Y.Doc {
    const replay = this.replayOf(documentName);
    const tail = log.readRange({ documentName, afterSequence: replay.lastSequence, untilSequence: Number.MAX_SAFE_INTEGER });
    tail.forEach((update) => Y.applyUpdate(replay.document, update.update));
    const lastSequence = tail.reduce((latest, update) => Math.max(latest, update.sequence), replay.lastSequence);
    this.replays.delete(documentName);
    this.replays.set(documentName, { document: replay.document, lastSequence });
    [...this.replays.keys()].slice(0, Math.max(0, this.replays.size - this.capacity)).forEach((evicted) => this.replays.delete(evicted));
    return replay.document;
  }
}

export function versionAt(_request: { log: UpdateLog; documentName: string; sequence: number }): Y.Doc {
  throw new Error('versionAt is not implemented');
}
