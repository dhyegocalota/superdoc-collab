import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const DEPLOY_COMPOSE_FILE = 'deploy/docker-compose.yml';
const INTERPOLATED_VARIABLE_PATTERN = /\$\{([A-Z_]+)[:?-]/g;

export function repositoryPath(path: string): string {
  return resolve(REPOSITORY_ROOT, path);
}

export function readRepositoryFile(path: string): string {
  return readFileSync(repositoryPath(path), 'utf8');
}

export function capturedNames({ text, pattern }: { text: string; pattern: RegExp }): string[] {
  return [...text.matchAll(pattern)].flatMap((match) => match.slice(1, 2));
}

export function composeVariables(): string[] {
  return [...new Set(capturedNames({ text: readRepositoryFile(DEPLOY_COMPOSE_FILE), pattern: INTERPOLATED_VARIABLE_PATTERN }))];
}
