import type { AwarenessEntry } from './frame-bucket';

export class AwarenessOwners {
  private readonly ownerByClientIdByDocument = new Map<string, Map<number, string>>();

  bind({ documentName, clientIds, userId }: { documentName: string; clientIds: number[]; userId: string }): void {
    const ownerByClientId = this.ownersOf(documentName);
    clientIds.filter((clientId) => !ownerByClientId.has(clientId)).forEach((clientId) => ownerByClientId.set(clientId, userId));
  }

  seed({ documentName, bindings }: { documentName: string; bindings: ReadonlyMap<number, { userId: string }> }): void {
    const ownerByClientId = this.ownersOf(documentName);
    bindings.forEach(({ userId }, clientId) => {
      if (!ownerByClientId.has(clientId)) ownerByClientId.set(clientId, userId);
    });
  }

  private ownersOf(documentName: string): Map<number, string> {
    const existing = this.ownerByClientIdByDocument.get(documentName);
    if (existing !== undefined) return existing;
    const created = new Map<number, string>();
    this.ownerByClientIdByDocument.set(documentName, created);
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
    const ownerByClientId = this.ownerByClientIdByDocument.get(documentName);
    if (ownerByClientId === undefined) return false;
    return entries.some(({ clientId, clock }) => {
      const owner = ownerByClientId.get(clientId);
      if (owner === undefined || owner === userId) return false;
      const held = meta.get(clientId);
      return held === undefined || clock > held.clock;
    });
  }

  forget(documentName: string): void {
    this.ownerByClientIdByDocument.delete(documentName);
  }
}
