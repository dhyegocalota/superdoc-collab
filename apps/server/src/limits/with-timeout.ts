export function withTimeout<Value>({
  work,
  milliseconds,
}: {
  work: Promise<Value>;
  milliseconds: number;
  onTimeout: () => Value;
}): Promise<Value> {
  work.catch(() => undefined);
  throw new Error(`withTimeout is not implemented: ${milliseconds}`);
}
