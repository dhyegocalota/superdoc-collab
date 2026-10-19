export function withTimeout<Value>({
  work,
  milliseconds,
  onTimeout,
}: {
  work: Promise<Value>;
  milliseconds: number;
  onTimeout: () => Value;
}): Promise<Value> {
  const timer: { handle: NodeJS.Timeout | null } = { handle: null };
  const expiredPromise = new Promise<void>((resolve) => {
    timer.handle = setTimeout(resolve, milliseconds);
  }).then(onTimeout);
  return Promise.race([work, expiredPromise]).finally(() => {
    if (timer.handle) clearTimeout(timer.handle);
  });
}
