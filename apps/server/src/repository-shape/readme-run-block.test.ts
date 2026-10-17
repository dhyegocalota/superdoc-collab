import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { DEMO_USERS } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readmes, readRepositoryFile, repositoryPath, workspacePackages } from './repository-files';

type PackageManifest = { name: string; scripts: Record<string, string> };

const README_FILE = 'README.md';
const ROOT_MANIFEST_FILE = 'package.json';
const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const ROOT_COMPOSE_FILE = 'docker-compose.yml';
const RUN_SECTION_HEADING = '## Run it';
const SECTION_END = '\n## ';
const PORT_VARIABLE = 'PORT';
const DEMO_PASSWORD_VARIABLE = 'DEMO_PASSWORD';
const PNPM_BUILT_INS = ['exec', 'install'];
const BASH_BLOCK_PATTERN = /```bash\n([\s\S]*?)```/g;
const FENCE_PATTERN = /```/;
const PNPM_COMMAND_PATTERN = /\bpnpm (?:--filter (\S+) )?(\S+)/g;
const SCRIPT_PATH_PATTERN = /(\bscripts\/[\w.-]+)/g;
const ASSIGNED_VARIABLE_PATTERN = /(?:^|\s)([A-Z][A-Z0-9_]*)=/gm;
const INTERPOLATED_VARIABLE_PATTERN = /\$\{([A-Z][A-Z0-9_]*)\}/g;
const DOCUMENTED_VARIABLE_PATTERN = /^([A-Z_]+)=(.*)$/gm;
const COMPOSE_VARIABLE_PATTERN = /^\s+([A-Z_]+):|\$\{([A-Z_]+)[:?-]/gm;
const COMPOSE_PUBLISHED_PORT_PATTERN = /"(\d+):\d+"/g;
const PROSE_VARIABLE_PATTERN = /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g;
const DEMO_ADDRESS_PATTERN = /([\w.-]+@example\.com)/g;
const DEMO_PASSWORD_PATTERN = /@example\.com` \/ `([^`]+)`/g;
const LOCAL_PORT_PATTERN = /http:\/\/localhost:(\d+)/g;
const FORBIDDEN_IN_OTHER_READMES = [
  ['fenced block', FENCE_PATTERN],
  ['pnpm command', /pnpm /],
  ['docker command', /docker /],
  ['environment variable', new RegExp(PROSE_VARIABLE_PATTERN.source)],
] as const;

const readme = readRepositoryFile(README_FILE);
const runBlocks = capturedNames({ text: readme, pattern: BASH_BLOCK_PATTERN }).join('\n');
const environmentExample = readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE);
const rootCompose = readRepositoryFile(ROOT_COMPOSE_FILE);
const environmentValues = new Map(
  [...environmentExample.matchAll(DOCUMENTED_VARIABLE_PATTERN)].flatMap(([, name, value]) =>
    name && value !== undefined ? [[name, value] as const] : [],
  ),
);
const documentedVariables = [...environmentValues.keys()];

function manifestOf(path: string): PackageManifest {
  return JSON.parse(readRepositoryFile(path));
}

function workspaceManifests(): PackageManifest[] {
  return workspacePackages().map((path) => manifestOf(posix.join(path, ROOT_MANIFEST_FILE)));
}

function environmentValue(name: string): string {
  const value = environmentValues.get(name);
  if (value === undefined) throw new Error(`${name} is not in ${ENVIRONMENT_EXAMPLE_FILE}`);
  return value;
}

function composeNames(): string[] {
  return [...rootCompose.matchAll(COMPOSE_VARIABLE_PATTERN)].flatMap((match) => match.slice(1).filter(Boolean));
}

function pnpmInvocations(): { packageName: string | undefined; script: string }[] {
  return [...runBlocks.matchAll(PNPM_COMMAND_PATTERN)]
    .flatMap(([, packageName, script]) => (script ? [{ packageName, script }] : []))
    .filter(({ script }) => !PNPM_BUILT_INS.includes(script));
}

function withoutRunSection(text: string): string {
  const start = text.indexOf(RUN_SECTION_HEADING);
  const end = text.indexOf(SECTION_END, start + RUN_SECTION_HEADING.length);
  return text.slice(0, start) + text.slice(end);
}

describe('the README run block', () => {
  test('has at least one pnpm command to check', () => {
    expect(pnpmInvocations().length).toBeGreaterThan(0);
  });

  test.each(pnpmInvocations().filter(({ packageName }) => !packageName))('pnpm $script is a script of the root package', ({ script }) => {
    expect(Object.keys(manifestOf(ROOT_MANIFEST_FILE).scripts)).toContain(script);
  });

  test.each(pnpmInvocations().filter(({ packageName }) => packageName))(
    'pnpm --filter $packageName $script is a script of that workspace package',
    ({ packageName, script }) => {
      const scripts = workspaceManifests().find((manifest) => manifest.name === packageName)?.scripts;
      expect(scripts && Object.keys(scripts)).toContain(script);
    },
  );

  test.each(capturedNames({ text: runBlocks, pattern: SCRIPT_PATH_PATTERN }))('%s exists', (path) => {
    expect(existsSync(repositoryPath(path))).toBe(true);
  });

  test.each([
    ...new Set([
      ...capturedNames({ text: runBlocks, pattern: ASSIGNED_VARIABLE_PATTERN }),
      ...capturedNames({ text: runBlocks, pattern: INTERPOLATED_VARIABLE_PATTERN }),
    ]),
  ])('%s is a documented or compose variable', (name) => {
    expect([...documentedVariables, ...composeVariables(), ...composeNames()]).toContain(name);
  });

  test('docker compose is used only when the compose file exists at the repository root', () => {
    expect(!runBlocks.includes('docker compose') || existsSync(repositoryPath(ROOT_COMPOSE_FILE))).toBe(true);
  });
});

describe('the README prose', () => {
  test.each(capturedNames({ text: readme, pattern: PROSE_VARIABLE_PATTERN }))('%s is a key of the example environment file', (name) => {
    expect(documentedVariables).toContain(name);
  });

  test.each(capturedNames({ text: readme, pattern: DEMO_ADDRESS_PATTERN }))('%s is a demo user', (email) => {
    expect(DEMO_USERS.map((user) => user.email)).toContain(email);
  });

  test('the demo password is the one in the example environment file', () => {
    expect(capturedNames({ text: readme, pattern: DEMO_PASSWORD_PATTERN })).toEqual([environmentValue(DEMO_PASSWORD_VARIABLE)]);
  });

  test.each(capturedNames({ text: readme, pattern: LOCAL_PORT_PATTERN }))(
    'localhost port %s is the configured or published port',
    (port) => {
      const publishedPorts = capturedNames({ text: rootCompose, pattern: COMPOSE_PUBLISHED_PORT_PATTERN });
      expect([environmentValue(PORT_VARIABLE), ...publishedPorts]).toContain(port);
    },
  );
});

describe('where commands and configuration may appear', () => {
  test('the only fenced blocks of the root README sit under the Run it heading', () => {
    expect(FENCE_PATTERN.test(withoutRunSection(readme))).toBe(false);
  });

  const otherReadmes = readmes().filter((path) => path !== README_FILE);

  test.each(otherReadmes.flatMap((path) => FORBIDDEN_IN_OTHER_READMES.map(([label, pattern]) => ({ path, label, pattern }))))(
    '$path has no $label',
    ({ path, pattern }) => {
      expect(pattern.test(readRepositoryFile(path))).toBe(false);
    },
  );
});
