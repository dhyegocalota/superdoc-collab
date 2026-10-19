export type AwarenessEntry = { clientId: number; clock: number };

export class AwarenessOwners {
  bind({ documentName, clientIds, userId }: { documentName: string; clientIds: number[]; userId: string }): void {
    throw new Error('AwarenessOwners.bind is not implemented');
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
    throw new Error('AwarenessOwners.forbids is not implemented');
  }

  forget(documentName: string): void {
    throw new Error('AwarenessOwners.forget is not implemented');
  }
}
