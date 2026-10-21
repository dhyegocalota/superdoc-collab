import { existsSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { PACKAGE_MANIFEST, readRepositoryFile, repositoryPath } from './repository-files';

const RULES_DIRECTORY = '.claude/rules';
const COLLABORATION_RULE = '.claude/rules/collaboration.md';
const WEB_UI_RULE = '.claude/rules/web-ui.md';
const MANIFESTS = ['apps/web', 'apps/server'].map((folder) => posix.join(folder, PACKAGE_MANIFEST));
const CITED_PATH_PATTERN = /(?<![\w/.-])((?:apps|libs|docs|e2e|tools|scripts|docker|poc)\/[\w./-]*[\w/])/g;
const VERSIONS_LINE_PATTERN = /^## Versions\n- (.+)$/m;
const PINNED_VERSION_PATTERN = /`([^`]+)` (\d+\.\d+\.\d+)/g;
const BROWSER_HEADING_PATTERN = /^## SuperDoc (\S+) in the browser$/m;
const SUPERDOC_PACKAGE = 'superdoc';
const TRAILING_PERIOD = /\.$/;

type Manifest = { dependencies: Record<string, string> };

function ruleFiles(): string[] {
  return readdirSync(repositoryPath(RULES_DIRECTORY))
    .filter((name) => name.endsWith('.md'))
    .map((name) => posix.join(RULES_DIRECTORY, name));
}

function installedVersion(packageName: string): string | undefined {
  return MANIFESTS.map((manifest) => (JSON.parse(readRepositoryFile(manifest)) as Manifest).dependencies[packageName]).find(Boolean);
}

function pinnedVersions(): [string, string][] {
  const line = VERSIONS_LINE_PATTERN.exec(readRepositoryFile(COLLABORATION_RULE))?.[1];
  if (!line) throw new Error(`${COLLABORATION_RULE} has no Versions line`);
  return [...line.matchAll(PINNED_VERSION_PATTERN)].map(([, name, version]) => [name!, version!]);
}

describe('the rules', () => {
  test('cite only paths that exist', () => {
    const missing = ruleFiles().flatMap((rule) =>
      [...readRepositoryFile(rule).matchAll(CITED_PATH_PATTERN)]
        .map(([, path]) => path!.replace(TRAILING_PERIOD, ''))
        .filter((path) => !existsSync(repositoryPath(path)))
        .map((path) => `${rule}: ${path}`),
    );
    expect(missing).toEqual([]);
  });

  test('pin the versions the manifests install', () => {
    const drifted = pinnedVersions()
      .filter(([name, version]) => installedVersion(name) !== version)
      .map(([name, version]) => `${name}: the rule says ${version}, the manifests say ${installedVersion(name)}`);
    expect(drifted).toEqual([]);
  });

  test('name the SuperDoc version the web app installs', () => {
    expect(BROWSER_HEADING_PATTERN.exec(readRepositoryFile(WEB_UI_RULE))?.[1]).toBe(installedVersion(SUPERDOC_PACKAGE));
  });
});
