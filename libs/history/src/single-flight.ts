export class SingleFlight<Value> {
  private readonly inFlight = new Map<string, Promise<Value>>();
  private readonly settled = new Map<string, Value>();
  computations = 0;

  async run({ key, compute }: { key: string; compute: () => Promise<Value> }): Promise<Value> {
    if (this.settled.has(key)) return this.settled.get(key) as Value;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    this.computations += 1;
    const promise = compute()
      .then((value) => {
        this.settled.set(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}
