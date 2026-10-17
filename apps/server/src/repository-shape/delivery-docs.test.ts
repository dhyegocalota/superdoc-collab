import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  capturedNames,
  composeVariables,
  DOCUMENTED_FOLDERS,
  readmes,
  readRepositoryFile,
  repositoryPath,
  workspacePackages,
} from './repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const RAILWAY_RUNBOOK_FILE = 'docs/features/deploy/runbook-railway.md';
const INSTALL_FILE = 'docs/install.md';
const AGENT_SECTION_HEADING = '## Install with an agent';
const CONFIGURATION_SECTION_HEADING = '## Configuration';
const RECOVERY_SECTION_HEADING = '## Recovery';
const SECTION_PATTERN = /^## /m;
const AGENT_PROMPT_PHRASES = ['AUTH_SECRET', 'APP_ORIGIN', 'SEED_DEMO_USERS=false', 'claim the instance'];
const ADMIN_PROMOTE_COMMAND = 'admin-promote';
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const HEADING_PATTERN = /^#{1,6} (.+)$/gm;
const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const SLUG_DISALLOWED_PATTERN = /[^a-z0-9 -]/g;
const SPACE_PATTERN = / /g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|#)/;
const ANCHOR_SEPARATOR = '#';
const MARKDOWN_EXTENSION = '.md';

function section({ text, heading }: { text: string; heading: string }): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`The install guide has no section ${heading}`);
  const [body] = text.slice(start + heading.length + 2).split(SECTION_PATTERN);
  if (body === undefined) throw new Error(`The install guide section ${heading} is empty`);
  return body;
}

function slugOf(heading: string): string {
  return heading.toLowerCase().replace(SLUG_DISALLOWED_PATTERN, '').replace(SPACE_PATTERN, '-');
}

function headingSlugs(path: string): string[] {
  return capturedNames({ text: readRepositoryFile(path).replace(FENCED_BLOCK_PATTERN, ''), pattern: HEADING_PATTERN }).map(slugOf);
}

function isBroken({ document, target }: { document: string; target: string }): boolean {
  const path = target.split(ANCHOR_SEPARATOR, 1).join('');
  const anchor = target.slice(path.length + ANCHOR_SEPARATOR.length);
  const targetPath = posix.join(posix.dirname(document), path);
  if (!existsSync(repositoryPath(targetPath))) return true;
  if (!anchor) return false;
  if (!targetPath.endsWith(MARKDOWN_EXTENSION)) return false;
  return !headingSlugs(targetPath).includes(anchor);
}

function brokenTargets({ document, text }: { document: string; text: string }): string[] {
  const prose = text.replace(FENCED_BLOCK_PATTERN, '').replace(INLINE_CODE_PATTERN, '');
  return capturedNames({ text: prose, pattern: LINK_PATTERN })
    .filter((target) => !EXTERNAL_LINK_PATTERN.test(target))
    .filter((target) => isBroken({ document, target }));
}

const LINKED_DOCUMENTS = [...readmes(), RUNBOOK_FILE, RAILWAY_RUNBOOK_FILE];

describe('delivery documents', () => {
  test.each(LINKED_DOCUMENTS)('every relative link in %s points at a file and a heading in the repository', (document) => {
    expect(brokenTargets({ document, text: readRepositoryFile(document) })).toEqual([]);
  });

  test('a link to a heading its target does not have is reported', () => {
    const text = `[missing](${RUNBOOK_FILE}#no-such-heading) [present](${RUNBOOK_FILE}#6-hand-it-over)`;
    expect(brokenTargets({ document: README_FILE, text })).toEqual([`${RUNBOOK_FILE}#no-such-heading`]);
  });

  test('a link written as inline code or inside a fenced block is not checked', () => {
    const text = '`[NNNN](NNNN-slug.md)`\n```\n[missing](no-such-file.md)\n```\n[broken](no-such-file.md)';
    expect(brokenTargets({ document: README_FILE, text })).toEqual(['no-such-file.md']);
  });

  test('every workspace package and e2e has a README', () => {
    expect(
      [...workspacePackages(), ...DOCUMENTED_FOLDERS].filter((path) => !existsSync(repositoryPath(posix.join(path, README_FILE)))),
    ).toEqual([]);
  });

  test('the runbook sets every variable the compose file reads', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(composeVariables().filter((name) => !runbook.includes(`\n${name}=`))).toEqual([]);
  });

  test('the install guide configuration table lists every variable the production compose reads', () => {
    const configuration = section({ text: readRepositoryFile(INSTALL_FILE), heading: CONFIGURATION_SECTION_HEADING });
    expect(composeVariables().filter((name) => !configuration.includes(`\`${name}\``))).toEqual([]);
  });

  test('the agent install prompt carries the variables and the claim instruction', () => {
    const agent = section({ text: readRepositoryFile(INSTALL_FILE), heading: AGENT_SECTION_HEADING });
    expect(AGENT_PROMPT_PHRASES.filter((phrase) => !agent.includes(phrase))).toEqual([]);
  });

  test('the install guide explains how to promote an administrator', () => {
    expect(section({ text: readRepositoryFile(INSTALL_FILE), heading: RECOVERY_SECTION_HEADING })).toContain(ADMIN_PROMOTE_COMMAND);
  });
});
