import { BlockChangeKind } from '@superdoc-collab/types';
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

const BINDING_KEY_SEPARATOR = '#';

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

function bindingKey(binding: ClientBinding): string {
  return `${binding.userId}${BINDING_KEY_SEPARATOR}${binding.actor}`;
}

function byUserThenActor(left: ClientBinding, right: ClientBinding): number {
  return bindingKey(left) < bindingKey(right) ? -1 : 1;
}

// NB ADR 0002: an update with no structs (deletion-only) is attributed to the sending connection.
export function resolveAuthorIds({
  update,
  identities,
}: {
  update: Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId' | 'connectionActor'>;
  identities: Map<number, ClientBinding>;
}): ClientBinding[] {
  const structAuthors = update.yjsClientIds.map((clientId) => {
    const binding = identities.get(clientId);
    if (!binding) throw new Error(`Yjs client ${clientId} has no bound identity.`);
    return binding;
  });
  if (structAuthors.length === 0) return [{ userId: update.connectionUserId, actor: update.connectionActor }];
  const distinct = new Map(structAuthors.map((binding) => [bindingKey(binding), { userId: binding.userId, actor: binding.actor }]));
  return [...distinct.values()].sort(byUserThenActor);
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
