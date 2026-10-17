export type LruEntry<Value> = { key: string; value: Value };

export class LruMap<Value> {
  readonly isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean;

  constructor({ isOverBudget }: { isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean }) {
    this.isOverBudget = isOverBudget;
  }

  get(key: string): Value | null {
    throw new Error(`LruMap.get is not implemented: ${key}`);
  }

  peek(key: string): Value | null {
    throw new Error(`LruMap.peek is not implemented: ${key}`);
  }

  set({ key }: LruEntry<Value>): LruEntry<Value>[] {
    throw new Error(`LruMap.set is not implemented: ${key}`);
  }

  delete(key: string): boolean {
    throw new Error(`LruMap.delete is not implemented: ${key}`);
  }

  keys(): string[] {
    throw new Error('LruMap.keys is not implemented');
  }

  values(): Value[] {
    throw new Error('LruMap.values is not implemented');
  }

  size(): number {
    throw new Error('LruMap.size is not implemented');
  }
}
