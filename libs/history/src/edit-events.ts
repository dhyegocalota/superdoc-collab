import { BlockChangeKind } from '@superdoc-history/types';
import { diffChars } from 'diff';
import * as Y from 'yjs';
import { readMainStoryBlocks, type Block } from './document-content';
import type { ClientBinding, LoggedUpdate } from './update-log';
import { endsItsMinute, markOf, type VersionMark } from './version-marks';

export type EditEvent = {
  sequence: number;
  serverTime: number;
  authorIds: string[];
  blockId: string;
  kind: BlockChangeKind;
  inserted: string;
  deleted: string;
};

type BlockStates = Map<string, Pick<Block, 'text' | 'mergedIntoBlockId'>>;
type BlockChange = Pick<EditEvent, 'blockId' | 'kind' | 'inserted' | 'deleted'>;

function readBlockStates(document: Y.Doc): BlockStates {
  return new Map(
    readMainStoryBlocks(document).map((block) => [block.blockId, { text: block.text, mergedIntoBlockId: block.mergedIntoBlockId }]),
  );
}

function diffBlockText({ blockId, before, after }: { blockId: string; before: string; after: string }): BlockChange {
  const parts = diffChars(before, after);
  const inserted = parts
    .filter((part) => part.added)
    .map((part) => part.value)
    .join('');
  const deleted = parts
    .filter((part) => part.removed)
    .map((part) => part.value)
    .join('');
  return { blockId, kind: BlockChangeKind.Modified, inserted, deleted };
}

function diffBlock({ blockId, before, after }: { blockId: string; before: BlockStates; after: BlockStates }): BlockChange[] {
  const beforeState = before.get(blockId);
  const afterState = after.get(blockId);
  if (!beforeState && afterState) return [{ blockId, kind: BlockChangeKind.Created, inserted: afterState.text, deleted: '' }];
  if (beforeState && !afterState) return [{ blockId, kind: BlockChangeKind.Removed, inserted: '', deleted: beforeState.text }];
  if (!beforeState || !afterState) return [];
  const wasMerged = beforeState.mergedIntoBlockId === null && afterState.mergedIntoBlockId !== null;
  const textChanged = beforeState.text !== afterState.text;
  const mergeChanges: BlockChange[] = wasMerged ? [{ blockId, kind: BlockChangeKind.Merged, inserted: '', deleted: '' }] : [];
  const textChanges = textChanged ? [diffBlockText({ blockId, before: beforeState.text, after: afterState.text })] : [];
  return [...mergeChanges, ...textChanges];
}

function diffBlocks({ before, after }: { before: BlockStates; after: BlockStates }): BlockChange[] {
  const blockIds = [...new Set([...before.keys(), ...after.keys()])];
  return blockIds.flatMap((blockId) => diffBlock({ blockId, before, after }));
}

// NB ADR 0002: an update with no structs (deletion-only) is attributed to the sending connection.
export function resolveAuthorIds({
  update,
  identities,
}: {
  update: Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>;
  identities: Map<number, ClientBinding>;
}): string[] {
  const structAuthors = update.yjsClientIds.flatMap((clientId) => {
    const binding = identities.get(clientId);
    if (!binding) throw new Error(`Yjs client ${clientId} has no bound identity.`);
    return [binding.userId];
  });
  if (structAuthors.length === 0) return [update.connectionUserId];
  return [...new Set(structAuthors)].sort();
}

export type ProjectedEdit = Omit<EditEvent, 'authorIds'> & Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId' | 'connectionActor'>;

export type ProjectedBatch = { events: ProjectedEdit[]; marks: VersionMark[] };

export function projectEditEvents({ baselineState, updates }: { baselineState: Uint8Array; updates: LoggedUpdate[] }): ProjectedBatch {
  const document = new Y.Doc();
  Y.applyUpdate(document, baselineState);
  let previous = readBlockStates(document);
  const marks: VersionMark[] = [];
  const events = updates.flatMap((update, index) => {
    Y.applyUpdate(document, update.update);
    const current = readBlockStates(document);
    const changes = diffBlocks({ before: previous, after: current });
    previous = current;
    if (endsItsMinute({ update, next: updates[index + 1] })) marks.push(markOf({ update, document, isBootstrap: false }));
    const { sequence, serverTime, yjsClientIds, connectionUserId, connectionActor } = update;
    return changes.map((change) => ({ ...change, sequence, serverTime, yjsClientIds, connectionUserId, connectionActor }));
  });
  return { events, marks };
}
