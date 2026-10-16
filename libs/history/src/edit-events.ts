import { BlockChangeKind } from '@superdoc-history/types';
import { diffChars } from 'diff';
import * as Y from 'yjs';
import { readMainStoryBlocks, type Block } from './document-content';
import type { LoggedUpdate } from './update-log';

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
  return new Map(readMainStoryBlocks(document).map((block) => [block.blockId, { text: block.text, mergedIntoBlockId: block.mergedIntoBlockId }]));
}

function diffBlockText({ blockId, before, after }: { blockId: string; before: string; after: string }): BlockChange {
  const parts = diffChars(before, after);
  const inserted = parts.filter((part) => part.added).map((part) => part.value).join('');
  const deleted = parts.filter((part) => part.removed).map((part) => part.value).join('');
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

export function resolveAuthorIds({ update, identities }: { update: Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>; identities: Map<number, string> }): string[] {
  const structAuthors = update.yjsClientIds.flatMap((clientId) => {
    const userId = identities.get(clientId);
    if (!userId) throw new Error(`Yjs client ${clientId} has no bound identity.`);
    return [userId];
  });
  if (structAuthors.length === 0) return [update.connectionUserId];
  return [...new Set(structAuthors)].sort();
}

export type ProjectedEdit = Omit<EditEvent, 'authorIds'> & Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>;

export function projectEditEvents({ baselineState, updates }: { baselineState: Uint8Array; updates: LoggedUpdate[] }): ProjectedEdit[] {
  const document = new Y.Doc();
  Y.applyUpdate(document, baselineState);
  let previous = readBlockStates(document);
  return updates.flatMap((update) => {
    Y.applyUpdate(document, update.update);
    const current = readBlockStates(document);
    const changes = diffBlocks({ before: previous, after: current });
    previous = current;
    const { sequence, serverTime, yjsClientIds, connectionUserId } = update;
    return changes.map((change) => ({ ...change, sequence, serverTime, yjsClientIds, connectionUserId }));
  });
}
