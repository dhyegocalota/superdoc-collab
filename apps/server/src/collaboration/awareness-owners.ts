import { MAX_ADOPTED_AWARENESS_BINDINGS_PER_DOCUMENT } from '@superdoc-collab/types';
import type { AwarenessEntry } from './frame-bucket';

type DocumentOwners = { ownerByClientId: Map<number, string>; adopted: Set<number> };

function pruneAbsent({ owners, isHeld }: { owners: DocumentOwners; isHeld: (clientId: number) => boolean }): void {
  [...owners.adopted]
    .filter((clientId) => !isHeld(clientId))
    .forEach((clientId) => {
      owners.adopted.delete(clientId);
      owners.ownerByClientId.delete(clientId);
    });
}

export class AwarenessOwners {
  private readonly ownersByDocument = new Map<string, DocumentOwners>();

  bind({
    documentName,
    clientIds,
    userId,
    isHeld,
  }: {
    documentName: string;
    clientIds: number[];
    userId: string;
    isHeld: (clientId: number) => boolean;
  }): void {
    const owners = this.ownersOf(documentName);
    clientIds
      .filter((clientId) => !owners.ownerByClientId.has(clientId))
      .forEach((clientId) => {
        if (owners.adopted.size >= MAX_ADOPTED_AWARENESS_BINDINGS_PER_DOCUMENT) pruneAbsent({ owners, isHeld });
        if (owners.adopted.size >= MAX_ADOPTED_AWARENESS_BINDINGS_PER_DOCUMENT) return;
        owners.ownerByClientId.set(clientId, userId);
        owners.adopted.add(clientId);
      });
  }

  seed({ documentName, bindings }: { documentName: string; bindings: ReadonlyMap<number, { userId: string }> }): void {
    const { ownerByClientId } = this.ownersOf(documentName);
    bindings.forEach(({ userId }, clientId) => {
      if (!ownerByClientId.has(clientId)) ownerByClientId.set(clientId, userId);
    });
  }

  private ownersOf(documentName: string): DocumentOwners {
    const existing = this.ownersByDocument.get(documentName);
    if (existing !== undefined) return existing;
    const created: DocumentOwners = { ownerByClientId: new Map(), adopted: new Set() };
    this.ownersByDocument.set(documentName, created);
    return created;
  }

  forbids({
    documentName,
    userId,
    entries,
    meta,
  }: {
    documentName: string;
    userId: string;
    entries: AwarenessEntry[];
    meta: ReadonlyMap<number, { clock: number }>;
  }): boolean {
    const owners = this.ownersByDocument.get(documentName);
    if (owners === undefined) return false;
    return entries.some(({ clientId, clock }) => {
      const owner = owners.ownerByClientId.get(clientId);
      if (owner === undefined || owner === userId) return false;
      const held = meta.get(clientId);
      const heldClock = held === undefined ? 0 : held.clock;
      return clock > heldClock;
    });
  }

  forget(documentName: string): void {
    this.ownersByDocument.delete(documentName);
  }
}
