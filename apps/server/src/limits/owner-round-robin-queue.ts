export class OwnerRoundRobinQueue<Item> {
  push({ owner, item }: { owner: string | null; item: Item }): void {
    throw new Error(`OwnerRoundRobinQueue.push is not implemented ${owner} ${String(item)}`);
  }

  shift(): Item | undefined {
    throw new Error('OwnerRoundRobinQueue.shift is not implemented');
  }

  remove(item: Item): void {
    throw new Error(`OwnerRoundRobinQueue.remove is not implemented ${String(item)}`);
  }

  hasOwner(owner: string | null): boolean {
    throw new Error(`OwnerRoundRobinQueue.hasOwner is not implemented ${owner}`);
  }
}
