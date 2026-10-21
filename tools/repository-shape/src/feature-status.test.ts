import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, REPOSITORY_ROOT, repositoryPath } from './repository-files';

const FEATURES_DIRECTORY = 'docs/features';
const FEATURES_INDEX = 'docs/features/README.md';
const SPEC_FILE = 'spec.md';
const TEMPLATE_FOLDER = '_template';
const REPOSITORY_URL = 'https://github.com/dhyegocalota/superdoc-collab';
const STATUS_LINE_PATTERN = /^(?:\*\*Status:\*\*|- Status:) (.+)$/m;
const STATUS_PATTERN = /^(?:Draft|In review|Approved|Building|Shipped \d{4}-\d{2}-\d{2})$/;
const SHIPPED_PREFIX = 'Shipped ';
const INDEX_ROW_PATTERN = /^\|(?: \d+ \|)? \[`([^`]+)`\]\(([^)]+)\) \| .+ \| (.+) \|$/gm;
const FOLDER_LINK_SUFFIX = '/';
const PULL_REQUEST_SUFFIX_PATTERN = new RegExp(` \\(\\[PR #(\\d+)\\]\\(${REPOSITORY_URL}/pull/\\1\\)\\)$`);
const MERGED_BRANCH_PATTERN = /^Merge pull request #\d+ from [^/\s]+\/[^/\s]+\/(\S+)$/gm;
const SHALLOW_REPOSITORY = 'true';
const TABLE_BREAK_PATTERN = /\|\n\n\|/;

type IndexRow = { slug: string; status: string; pullRequest: string | undefined };

function featureSlugs(): string[] {
  return readdirSync(repositoryPath(FEATURES_DIRECTORY), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== TEMPLATE_FOLDER)
    .map((entry) => entry.name);
}

function specStatus(slug: string): string | undefined {
  const spec = readRepositoryFile(posix.join(FEATURES_DIRECTORY, slug, SPEC_FILE));
  return STATUS_LINE_PATTERN.exec(spec)?.[1];
}

function parseRow(match: RegExpMatchArray): IndexRow {
  const [, slug, link, cell] = match;
  const pullRequest = PULL_REQUEST_SUFFIX_PATTERN.exec(cell!)?.[1];
  const status = cell!.replace(PULL_REQUEST_SUFFIX_PATTERN, '');
  const linkMatchesSlug = link === `${slug}${FOLDER_LINK_SUFFIX}`;
  if (!linkMatchesSlug) throw new Error(`The index row ${slug} links ${link}`);
  return { slug: slug!, status, pullRequest };
}

function indexRows(): IndexRow[] {
  return [...readRepositoryFile(FEATURES_INDEX).matchAll(INDEX_ROW_PATTERN)].map(parseRow);
}

function rowsFor({ rows, slug }: { rows: IndexRow[]; slug: string }): IndexRow[] {
  return rows.filter((row) => row.slug === slug);
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: REPOSITORY_ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}

function mergedBranchSlugs(): Set<string> {
  const isShallow = git(['rev-parse', '--is-shallow-repository']).trim() === SHALLOW_REPOSITORY;
  if (isShallow) throw new Error('A shallow clone has no merge history to check');
  return new Set([...git(['log', '--merges', '--format=%s']).matchAll(MERGED_BRANCH_PATTERN)].map((match) => match[1]!));
}

function statusViolations(slug: string): string[] {
  const status = specStatus(slug);
  if (status === undefined) return [`${slug}: spec.md has no status line`];
  if (!STATUS_PATTERN.test(status)) return [`${slug}: status "${status}" is not in the vocabulary`];
  return [];
}

function rowViolations({ rows, slug }: { rows: IndexRow[]; slug: string }): string[] {
  const own = rowsFor({ rows, slug });
  if (own.length !== 1) return [`${slug}: ${own.length} index rows`];
  const [row] = own;
  const status = specStatus(slug);
  const statusDiffers = row!.status !== status;
  if (statusDiffers) return [`${slug}: the index says "${row!.status}", the spec says "${status}"`];
  const pullRequestOnUnshipped = row!.pullRequest !== undefined && !row!.status.startsWith(SHIPPED_PREFIX);
  if (pullRequestOnUnshipped) return [`${slug}: a pull request link on a row that is not shipped`];
  return [];
}

describe('feature status', () => {
  test('every feature folder has a spec with a status line from the vocabulary', () => {
    expect(featureSlugs().flatMap(statusViolations)).toEqual([]);
  });

  test('the index has one row per feature folder, each carrying the status of its spec', () => {
    const rows = indexRows();
    const slugs = featureSlugs();
    const orphanRows = rows.filter((row) => !slugs.includes(row.slug)).map((row) => `${row.slug}: index row without a folder`);
    expect([...slugs.flatMap((slug) => rowViolations({ rows, slug })), ...orphanRows]).toEqual([]);
  });

  test('shipped rows of the index follow their ship dates', () => {
    const shippedDates = indexRows()
      .filter((row) => row.status.startsWith(SHIPPED_PREFIX))
      .map((row) => row.status.slice(SHIPPED_PREFIX.length));
    expect(shippedDates).toEqual([...shippedDates].sort());
  });

  test('no blank line splits a table of the index', () => {
    expect(readRepositoryFile(FEATURES_INDEX)).not.toMatch(TABLE_BREAK_PATTERN);
  });

  test('a feature whose branch was merged is shipped', () => {
    const merged = mergedBranchSlugs();
    const unshipped = featureSlugs()
      .filter((slug) => merged.has(slug))
      .filter((slug) => !specStatus(slug)?.startsWith(SHIPPED_PREFIX))
      .map((slug) => `${slug}: merged but the spec says "${specStatus(slug)}"`);
    expect(unshipped).toEqual([]);
  });
});
