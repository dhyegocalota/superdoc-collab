import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMPORARY_DIRECTORY_PREFIX = 'superdoc-collab-';

export function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
}
