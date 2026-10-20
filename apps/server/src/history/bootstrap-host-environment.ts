import { BYTES_PER_MEGABYTE } from '@superdoc-collab/types';

export type HostEnvironment = Record<string, string | undefined>;

const SECRET_NAME_PATTERN = /SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL/i;
const UNNEEDED_NAMES = new Set(['DATABASE_DIR', 'OPENROUTER_BASE_URL']);
const HOST_MEMORY_NAME = 'BUN_JSC_forceRAMSize';

function isUnneeded(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name) || UNNEEDED_NAMES.has(name);
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
  return Object.fromEntries([...blanked, [HOST_MEMORY_NAME, String(heapMegabytes * BYTES_PER_MEGABYTE)]]);
}
