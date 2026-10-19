export type HostEnvironment = Record<string, string | undefined>;

const SECRET_NAME_PATTERN = /SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL/i;
const UNNEEDED_NAMES = new Set(['DATABASE_DIR', 'OPENROUTER_BASE_URL']);
const NODE_OPTIONS_NAME = 'NODE_OPTIONS';
const HEAP_FLAG = '--max-old-space-size';

function isUnneeded(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name) || UNNEEDED_NAMES.has(name);
}

function nodeOptionsWithHeap({ existing, heapMegabytes }: { existing: string | undefined; heapMegabytes: number }): string {
  const heapOption = `${HEAP_FLAG}=${heapMegabytes}`;
  if (existing === undefined) return heapOption;
  return `${existing} ${heapOption}`;
}

export function bootstrapHostEnvironment({
  source,
  heapMegabytes,
}: {
  source: NodeJS.ProcessEnv;
  heapMegabytes: number | null;
}): HostEnvironment {
  const blanked = Object.keys(source)
    .filter(isUnneeded)
    .map((name): [string, string | undefined] => [name, undefined]);
  if (heapMegabytes === null) return Object.fromEntries(blanked);
  return Object.fromEntries([...blanked, [NODE_OPTIONS_NAME, nodeOptionsWithHeap({ existing: source[NODE_OPTIONS_NAME], heapMegabytes })]]);
}
