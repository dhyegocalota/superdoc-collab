import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readRepositoryFile, repositoryPath } from '../testing/repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const LINE_SEPARATOR = '\n';
const SECRET_NOTE_PREFIX = '# Secret';
const SECRET_VARIABLES = ['AUTH_SECRET', 'DEMO_PASSWORD', 'OPENROUTER_API_KEY'];
const LINKED_DOCUMENTS = [README_FILE, RUNBOOK_FILE];
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const HEADING_PATTERN = /^#{1,6} (.+)$/gm;
const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/g;
const SLUG_DISALLOWED_PATTERN = /[^a-z0-9 -]/g;
const SPACE_PATTERN = / /g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|#)/;
const ANCHOR_SEPARATOR = '#';
const MARKDOWN_EXTENSION = '.md';
const SECOND_LEVEL_HEADING_PATTERN = /^## (.+)$/gm;
const DELIVERY_SECTIONS = ['Live demo', 'Try it', 'Run locally', 'Run with Docker', 'Deploy (Dokploy)', 'Limits', 'Credits'];
const STALE_SECTIONS = ['Status', 'Quick start', 'Citations'];
const RUNBOOK_LINK = `](${RUNBOOK_FILE})`;

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
  return capturedNames({ text, pattern: LINK_PATTERN }).filter((target) => !EXTERNAL_LINK_PATTERN.test(target)).filter((target) => isBroken({ document, target }));
}

function readmeSections(): string[] {
  return capturedNames({ text: readRepositoryFile(README_FILE), pattern: SECOND_LEVEL_HEADING_PATTERN });
}

function lineAbove({ lines, name }: { lines: string[]; name: string }): string {
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (index < 1) throw new Error(`${ENVIRONMENT_EXAMPLE_FILE} has no line above ${name}=`);
  return lines.slice(index - 1, index).join('');
}

describe('delivery documents', () => {
  test.each(LINKED_DOCUMENTS)('every relative link in %s points at a file and a heading in the repository', (document) => {
    expect(brokenTargets({ document, text: readRepositoryFile(document) })).toEqual([]);
  });

  test('a link to a heading its target does not have is reported', () => {
    const text = `[missing](${RUNBOOK_FILE}#no-such-heading) [present](${RUNBOOK_FILE}#6-hand-it-over)`;
    expect(brokenTargets({ document: README_FILE, text })).toEqual([`${RUNBOOK_FILE}#no-such-heading`]);
  });

  test('the README carries every delivery section', () => {
    expect(DELIVERY_SECTIONS.filter((section) => !readmeSections().includes(section))).toEqual([]);
  });

  test('the README drops the sections that went stale', () => {
    expect(STALE_SECTIONS.filter((section) => readmeSections().includes(section))).toEqual([]);
  });

  test('the README links the deploy runbook', () => {
    expect(readRepositoryFile(README_FILE)).toContain(RUNBOOK_LINK);
  });

  test('the runbook sets every variable the compose file reads', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(composeVariables().filter((name) => !runbook.includes(`\n${name}=`))).toEqual([]);
  });

  test.each(SECRET_VARIABLES)('the example file marks %s as a secret', (name) => {
    expect(lineAbove({ lines: readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE).split(LINE_SEPARATOR), name })).toMatch(new RegExp(`^${SECRET_NOTE_PREFIX}`));
  });
});
