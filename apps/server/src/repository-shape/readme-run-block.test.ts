import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { DEMO_USERS } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import {
  capturedNames,
  composeVariables,
  DOCUMENTED_FOLDERS,
  PACKAGE_MANIFEST,
  readRepositoryFile,
  repositoryPath,
  workspacePackages,
} from './repository-files';

type PackageManifest = { name: string; scripts: Record<string, string> };
type PnpmInvocation = { packageName: string | undefined; script: string };

const README_FILE = 'README.md';
const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const ROOT_COMPOSE_FILE = 'docker-compose.yml';
const RUN_SECTION_HEADING = '## Run it';
const SECTION_END = '\n## ';
const LINE_SEPARATOR = '\n';
const COMPOSE_COMMAND = 'docker compose';
const PORT_VARIABLE = 'PORT';
const DEMO_PASSWORD_VARIABLE = 'DEMO_PASSWORD';
const PNPM_BUILT_INS = ['exec', 'install'];
const FENCE_PATTERN = /```/;
const PNPM_COMMAND_PATTERN = /\bpnpm (?:--filter (\S+) )?(\w[\w:-]*)/g;
const COMPOSE_FILE_FLAG_PATTERN = /-f (\S+)/g;
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
  return workspacePackages().map((path) => manifestOf(posix.join(path, PACKAGE_MANIFEST)));
}

function environmentValue(name: string): string {
  const value = environmentValues.get(name);
  if (value === undefined) throw new Error(`${name} is not in ${ENVIRONMENT_EXAMPLE_FILE}`);
  return value;
}

function composeNames(): string[] {
  return [...rootCompose.matchAll(COMPOSE_VARIABLE_PATTERN)].flatMap((match) => match.slice(1).filter(Boolean));
}

function runSection(text: string): string {
  const start = text.indexOf(RUN_SECTION_HEADING);
  if (start === -1) throw new Error(`${RUN_SECTION_HEADING} is missing`);
  const end = text.indexOf(SECTION_END, start + RUN_SECTION_HEADING.length);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

function withoutRunSection(text: string): string {
  return text.replace(runSection(text), '');
}

function pnpmInvocations(text: string): PnpmInvocation[] {
  return [...text.matchAll(PNPM_COMMAND_PATTERN)]
    .flatMap(([, packageName, script]) => (script ? [{ packageName, script }] : []))
    .filter(({ script }) => !PNPM_BUILT_INS.includes(script));
}

function isPackageScript({ packageName, script }: PnpmInvocation): boolean {
  const manifest = packageName ? workspaceManifests().find(({ name }) => name === packageName) : manifestOf(PACKAGE_MANIFEST);
  if (!manifest) return false;
  return script in manifest.scripts;
}

function composeFiles(text: string): string[] {
  return text
    .split(LINE_SEPARATOR)
    .filter((line) => line.includes(COMPOSE_COMMAND))
    .flatMap((line) => {
      const flaggedFiles = capturedNames({ text: line, pattern: COMPOSE_FILE_FLAG_PATTERN });
      return flaggedFiles.length ? flaggedFiles : [ROOT_COMPOSE_FILE];
    });
}

const runText = runSection(readme);

describe('the README run section', () => {
  test('has at least one pnpm command to check', () => {
    expect(pnpmInvocations(runText).length).toBeGreaterThan(0);
  });

  test.each(pnpmInvocations(runText))('pnpm $packageName $script is a script of its package', (invocation) => {
    expect(isPackageScript(invocation)).toBe(true);
  });

  test.each(capturedNames({ text: runText, pattern: SCRIPT_PATH_PATTERN }))('%s exists', (path) => {
    expect(existsSync(repositoryPath(path))).toBe(true);
  });

  test.each([
    ...new Set([
      ...capturedNames({ text: runText, pattern: ASSIGNED_VARIABLE_PATTERN }),
      ...capturedNames({ text: runText, pattern: INTERPOLATED_VARIABLE_PATTERN }),
    ]),
  ])('%s is a documented or compose variable', (name) => {
    expect([...documentedVariables, ...composeVariables(), ...composeNames()]).toContain(name);
  });

  test.each(composeFiles(runText))('docker compose uses %s, which exists', (file) => {
    expect(existsSync(repositoryPath(file))).toBe(true);
  });

  test('a pnpm command written in prose is checked like one in a fenced block', () => {
    const scratch = runSection(readme.replace('`docker compose down -v`', '`pnpm reset`'));
    expect(pnpmInvocations(scratch).filter((invocation) => !isPackageScript(invocation))).toEqual([
      { packageName: undefined, script: 'reset' },
    ]);
  });

  test('a compose file that does not exist is reported', () => {
    expect(composeFiles('docker compose -f nope.yml up').filter((file) => !existsSync(repositoryPath(file)))).toEqual(['nope.yml']);
  });

  test('a compose command without a file flag is checked against the root compose file', () => {
    expect(composeFiles('docker compose up')).toEqual([ROOT_COMPOSE_FILE]);
  });

  test('a missing heading throws and a last section runs to the end', () => {
    expect(() => runSection('# Title')).toThrow();
    expect(runSection(`# Title\n\n${RUN_SECTION_HEADING}\n\ntext`)).toBe(`${RUN_SECTION_HEADING}\n\ntext`);
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

  const packageReadmes = [...workspacePackages(), ...DOCUMENTED_FOLDERS].map((path) => posix.join(path, README_FILE));

  test.each(packageReadmes.flatMap((path) => FORBIDDEN_IN_OTHER_READMES.map(([label, pattern]) => ({ path, label, pattern }))))(
    '$path has no $label',
    ({ path, pattern }) => {
      expect(pattern.test(readRepositoryFile(path))).toBe(false);
    },
  );
});
