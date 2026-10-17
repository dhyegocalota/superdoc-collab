import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

export function repositoryPath(path: string): string {
  return resolve(REPOSITORY_ROOT, path);
}

export function readRepositoryFile(path: string): string {
  return readFileSync(repositoryPath(path), 'utf8');
}
