export class OwnerRoundRobinQueue<Item> {
  private readonly itemsByOwner = new Map<string | null, Item[]>();

  push({ owner, item }: { owner: string | null; item: Item }): void {
    this.itemsByOwner.set(owner, [...this.itemsOf(owner), item]);
  }

  shift(): Item | undefined {
    const first = this.itemsByOwner.entries().next();
    if (first.done) return undefined;
    const [owner, [item, ...remaining]] = first.value;
    this.itemsByOwner.delete(owner);
    if (remaining.length > 0) this.itemsByOwner.set(owner, remaining);
    return item;
  }

  remove(item: Item): void {
    [...this.itemsByOwner.entries()].forEach(([owner, items]) => {
      const remaining = items.filter((queued) => queued !== item);
      if (remaining.length === 0) return void this.itemsByOwner.delete(owner);
      this.itemsByOwner.set(owner, remaining);
    });
  }

  turnOrder({ also }: { also?: { owner: string | null; item: Item } } = {}): Item[] {
    const queues = [...this.queuesWith(also)];
    const longest = Math.max(0, ...queues.map((items) => items.length));
    return Array.from({ length: longest }, (_, turn) => queues.flatMap((items) => items.slice(turn, turn + 1))).flat();
  }

  hasOwner(owner: string | null): boolean {
    return this.itemsByOwner.has(owner);
  }

  private queuesWith(also: { owner: string | null; item: Item } | undefined): Item[][] {
    if (also === undefined) return [...this.itemsByOwner.values()];
    const entries = new Map(this.itemsByOwner);
    entries.set(also.owner, [...this.itemsOf(also.owner), also.item]);
    return [...entries.values()];
  }

  private itemsOf(owner: string | null): Item[] {
    const items = this.itemsByOwner.get(owner);
    if (items === undefined) return [];
    return items;
  }
}
