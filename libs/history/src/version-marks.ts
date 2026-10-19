import { VERSION_MARK_MS } from '@superdoc-collab/types';
import * as Y from 'yjs';
import type { LoggedUpdate } from './update-log';

export type VersionMark = { sequence: number; serverTime: number; minuteStart: number; isBootstrap: boolean; snapshot: Uint8Array };
export type VersionMarkSummary = Omit<VersionMark, 'snapshot'>;

export function minuteStartOf(serverTime: number): number {
  return Math.floor(serverTime / VERSION_MARK_MS) * VERSION_MARK_MS;
}

// NB ADR 0003 (addendum): a version mark is kept once per minute, so time travel resolves at minute granularity.
export function endsItsMinute({ update, next }: { update: LoggedUpdate; next: LoggedUpdate | undefined }): boolean {
  if (!next) return true;
  return minuteStartOf(next.serverTime) !== minuteStartOf(update.serverTime);
}

export function markOf({ update, document, isBootstrap }: { update: LoggedUpdate; document: Y.Doc; isBootstrap: boolean }): VersionMark {
  return {
    sequence: update.sequence,
    serverTime: update.serverTime,
    minuteStart: minuteStartOf(update.serverTime),
    isBootstrap,
    snapshot: Y.encodeSnapshot(Y.snapshot(document)),
  };
}

export function versionSequenceAt({ marks, time }: { marks: VersionMarkSummary[]; time: number }): number | null {
  const first = marks[0];
  if (!first) return null;
  const before = marks.filter((mark) => mark.minuteStart <= minuteStartOf(time)).at(-1);
  if (!before) return first.sequence;
  return before.sequence;
}

export function clampToMark({ marks, sequence }: { marks: VersionMarkSummary[]; sequence: number }): VersionMarkSummary | null {
  const first = marks[0];
  if (!first) return null;
  const atOrBefore = marks.filter((mark) => mark.sequence <= sequence).at(-1);
  if (!atOrBefore) return first;
  return atOrBefore;
}

export type ResolvedVersion = { sequence: number; serverTime: number };

export function resolveMark({
  marks,
  sequence,
  serverTime,
}: {
  marks: VersionMarkSummary[];
  sequence: number;
  serverTime: number | null;
}): ResolvedVersion | null {
  const first = marks[0];
  if (!first) return null;
  if (sequence <= first.sequence) return first;
  if (serverTime === null) return clampToMark({ marks, sequence });
  return { sequence, serverTime };
}
