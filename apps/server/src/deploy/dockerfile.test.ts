import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, repositoryPath } from '../testing/repository-files';

const DOCKERFILE = 'docker/Dockerfile';
const BUILD_WORKSPACE = '/workspace';
const INSTALL_INSTRUCTION = 'RUN pnpm install --frozen-lockfile';
const COPY_SOURCES_INSTRUCTION = 'COPY . .';
const DEPLOY_INSTRUCTION_PREFIX = 'RUN pnpm deploy ';
const TOKEN_SEPARATOR = ' ';

function dockerfileLines(): string[] {
  return readRepositoryFile(DOCKERFILE).split('\n');
}

function deployTarget(): string {
  const instruction = dockerfileLines().find((line) => line.startsWith(DEPLOY_INSTRUCTION_PREFIX));
  if (!instruction) throw new Error(`${DOCKERFILE} has no pnpm deploy instruction`);
  return posix.relative(BUILD_WORKSPACE, instruction.split(TOKEN_SEPARATOR).slice(-1).join(''));
}

describe('Dockerfile', () => {
  test('installs dependencies from the workspace manifests before copying the sources', () => {
    const lines = dockerfileLines();
    const installIndex = lines.indexOf(INSTALL_INSTRUCTION);
    expect(installIndex).toBeGreaterThan(0);
    expect(lines.slice(0, installIndex)).not.toContain(COPY_SOURCES_INSTRUCTION);
    expect(lines.slice(installIndex)).toContain(COPY_SOURCES_INSTRUCTION);
  });

  test('pnpm deploy writes to a folder the repository does not have', () => {
    expect(deployTarget()).not.toBe('');
    expect(existsSync(repositoryPath(deployTarget()))).toBe(false);
  });
});
