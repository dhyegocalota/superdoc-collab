import { readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, repositoryPath } from './repository-files';

const ADR_DIRECTORY = 'docs/adr';
const ADR_INDEX = 'docs/adr/README.md';
const ADR_FILE_PATTERN = /^\d{4}-[\w-]+\.md$/;
const ADR_TITLE_PATTERN = /^# (\d{4})\. (.+)$/m;
const ADR_STATUS_PATTERN = /^- Status: (Accepted|Proposed|Superseded by \[\d{4}\]\([^)]+\))/m;
const ADR_DATE_PATTERN = /^- Date: (\d{4}-\d{2}-\d{2})$/m;
const ADR_ROW_PATTERN = /^\| \[\d{4}\]\([^)]+\) \|.*$/gm;
const LEARNINGS_DIRECTORY = 'docs/learnings';
const LEARNINGS_INDEX = 'docs/learnings/README.md';
const LEARNING_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}-[\w-]+\.md$/;
const LEARNING_ROW_PATTERN = /^\| (\d{4}-\d{2}-\d{2}) \| .+ \| \[([^\]]+)\]\(([^)]+)\) \| .+ \|$/gm;
const SECTION_PATTERN = /^### /m;

type LearningRow = { date: string; file: string };

function filesIn({ directory, pattern }: { directory: string; pattern: RegExp }): string[] {
  return readdirSync(repositoryPath(directory))
    .filter((name) => pattern.test(name))
    .sort();
}

function captured({ text, pattern, file }: { text: string; pattern: RegExp; file: string }): RegExpExecArray {
  const match = pattern.exec(text);
  if (!match) throw new Error(`${file} does not match ${pattern}`);
  return match;
}

function expectedAdrRow(file: string): string {
  const record = readRepositoryFile(posix.join(ADR_DIRECTORY, file));
  const [, number, title] = captured({ text: record, pattern: ADR_TITLE_PATTERN, file });
  const [, status] = captured({ text: record, pattern: ADR_STATUS_PATTERN, file });
  const [, date] = captured({ text: record, pattern: ADR_DATE_PATTERN, file });
  return `| [${number}](${file}) | ${title} | ${status} | ${date} |`;
}

function learningSections(): LearningRow[][] {
  return readRepositoryFile(LEARNINGS_INDEX)
    .split(SECTION_PATTERN)
    .slice(1)
    .map((section) => [...section.matchAll(LEARNING_ROW_PATTERN)].map(([, date, , file]) => ({ date: date!, file: file! })));
}

function isInDateOrder(rows: LearningRow[]): boolean {
  return rows.every((row, position) => position === 0 || rows[position - 1]!.date <= row.date);
}

describe('the ADR index', () => {
  test('lists every record once, in number order, with the title, status and date the record states', () => {
    const rows = readRepositoryFile(ADR_INDEX).match(ADR_ROW_PATTERN);
    expect(rows).toEqual(filesIn({ directory: ADR_DIRECTORY, pattern: ADR_FILE_PATTERN }).map(expectedAdrRow));
  });
});

describe('the learnings index', () => {
  test('lists every learning once', () => {
    const listed = learningSections()
      .flat()
      .map((row) => row.file)
      .sort();
    expect(listed).toEqual(filesIn({ directory: LEARNINGS_DIRECTORY, pattern: LEARNING_FILE_PATTERN }));
  });

  test('keeps the rows of each area in date order', () => {
    const unordered = learningSections().filter((rows) => !isInDateOrder(rows));
    expect(unordered).toEqual([]);
  });
});
