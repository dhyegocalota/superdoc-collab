type LruEntry<Value> = { key: string; value: Value };

export class LruMap<Value> {
  private readonly entries = new Map<string, Value>();
  private readonly isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean;

  constructor({ isOverBudget }: { isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean }) {
    this.isOverBudget = isOverBudget;
  }

  get(key: string): Value | null {
    const value = this.peek(key);
    if (value === null) return null;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  peek(key: string): Value | null {
    const value = this.entries.get(key);
    if (value === undefined) return null;
    return value;
  }

  set({ key, value }: LruEntry<Value>): LruEntry<Value>[] {
    this.entries.delete(key);
    this.entries.set(key, value);
    return this.evict();
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  values(): Value[] {
    return [...this.entries.values()];
  }

  size(): number {
    return this.entries.size;
  }

  private evict(): LruEntry<Value>[] {
    if (!this.isOverBudget(this.entries)) return [];
    const [oldest] = this.entries;
    if (!oldest) return [];
    const [key, value] = oldest;
    this.entries.delete(key);
    return [{ key, value }, ...this.evict()];
  }
}
