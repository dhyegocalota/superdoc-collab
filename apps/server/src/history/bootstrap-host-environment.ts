export type HostEnvironment = Record<string, string | undefined>;

export function bootstrapHostEnvironment({
  source,
  heapMegabytes,
}: {
  source: NodeJS.ProcessEnv;
  heapMegabytes: number | null;
}): HostEnvironment {
  throw new Error(`bootstrapHostEnvironment is not implemented ${Object.keys(source).length} ${heapMegabytes}`);
}
