import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readRepositoryFile, repositoryPath } from '../testing/repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const LINE_SEPARATOR = '\n';
const SECRET_NOTE_PREFIX = '# Secret';
const LICENSE_FILE = 'LICENSE';
const CREDITS_HEADING = '## Credits';
const LICENSE_HEADING = '## License';
const LICENSE_SECTION_PATTERN = /## License\n([\s\S]*)$/;
const STALE_LICENSE_TEXT = 'private until delivery';
const CREDITED_LIBRARIES = [
  'SuperDoc',
  'Hocuspocus',
  'Yjs',
  'Better Auth',
  'Drizzle',
  'Hono',
  'React',
  'Vite',
  'd3',
  'Vercel AI SDK',
  'OpenRouter',
  'shadcn/ui',
  'superpowers',
];
const CAPS_BUSY_TEXT = 'The language model is busy; try again later.';
const STALE_CAPS_TEXT = 'Past them, topics show';
const SECRET_SCAN_PATTERNS = ['AUTH_SECRET=', 'DEMO_PASSWORD='];
const ENVIRONMENT_FILES_SCAN = "git log --all --name-only --format= | grep -E '(^|/)\\.env' | grep -vx '.env.example'";
const PUBLIC_SWITCH_BOX_MARKER = 'before the repository goes public';
const TEST_PLAN_FILE = 'docs/features/deploy/test-plan.md';
const SQUASH_MERGE_NOTE = 'drop `-m 1` for a squash merge';
const DEPLOY_REPORTED_NOTE = 'as soon as `up -d` returns';
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
  return capturedNames({ text, pattern: LINK_PATTERN })
    .filter((target) => !EXTERNAL_LINK_PATTERN.test(target))
    .filter((target) => isBroken({ document, target }));
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
    expect(lineAbove({ lines: readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE).split(LINE_SEPARATOR), name })).toMatch(
      new RegExp(`^${SECRET_NOTE_PREFIX}`),
    );
  });

  test('the README license section matches the license files of the repository', () => {
    const license = LICENSE_SECTION_PATTERN.exec(readRepositoryFile(README_FILE))?.[1];
    expect(license).toBeDefined();
    expect(license).not.toContain(STALE_LICENSE_TEXT);
    expect(license?.includes(LICENSE_FILE)).toBe(existsSync(repositoryPath(LICENSE_FILE)));
  });

  test('the README credits every library the product is built on', () => {
    const readme = readRepositoryFile(README_FILE);
    const credits = readme.slice(readme.indexOf(CREDITS_HEADING), readme.indexOf(LICENSE_HEADING));
    expect(CREDITED_LIBRARIES.filter((library) => !credits.includes(library))).toEqual([]);
  });

  test('the README limits quote what users see when the language-model caps are reached', () => {
    const readme = readRepositoryFile(README_FILE);
    expect(readme).toContain(CAPS_BUSY_TEXT);
    expect(readme).not.toContain(STALE_CAPS_TEXT);
  });

  test('the runbook scans the history for the generated secrets too', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(SECRET_SCAN_PATTERNS.filter((pattern) => !runbook.includes(pattern, runbook.indexOf('git log --all')))).toEqual([]);
  });

  test('the runbook covers squash merges and the early deploy report', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect([SQUASH_MERGE_NOTE, DEPLOY_REPORTED_NOTE].filter((note) => !runbook.includes(note))).toEqual([]);
  });

  test.each([RUNBOOK_FILE, TEST_PLAN_FILE])('%s scans the history for every committed environment file', (document) => {
    expect(readRepositoryFile(document)).toContain(ENVIRONMENT_FILES_SCAN);
  });

  test('the test plan owner box scans the history for the generated secrets too', () => {
    const ownerBox = readRepositoryFile(TEST_PLAN_FILE)
      .split(LINE_SEPARATOR)
      .find((line) => line.includes(PUBLIC_SWITCH_BOX_MARKER));
    expect(ownerBox).toBeDefined();
    expect(SECRET_SCAN_PATTERNS.filter((pattern) => !ownerBox?.includes(pattern))).toEqual([]);
  });
});
