import { readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, repositoryPath } from './repository-files';

const SCENARIOS_DIRECTORY = 'docs/scenarios';
const SCENARIOS_INDEX = 'docs/scenarios/README.md';
const MCP_CONFIG_FILE = '.mcp.json';
const CODEX_CONFIG_FILE = '.codex/config.toml';
const CODEX_SERVER_PATTERN = /^\[mcp_servers\.(\S+)\]$/gm;
const INDEX_FILE_NAME = 'README.md';
const MARKDOWN_EXTENSION = '.md';
const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;
const SCALAR_PATTERN = /^(\w+): (.+)$/gm;
const PATH_ENTRY_PATTERN = /^ {2}- "([^"]+)"$/gm;
const TEST_SECTION_PATTERN = /^### T\d+ .+$/gm;
const EXPECT_LINE_PATTERN = /^- Expect: .+$/gm;
const EXPECTS_PER_TEST = 1;
const PLAYWRIGHT_SERVER_PREFIX = 'playwright';
const REQUIRED_SCALARS = ['name', 'title', 'authors'];

type Scenario = { slug: string; body: string; scalars: Record<string, string>; paths: string[] };

function scenarioFiles(): string[] {
  return readdirSync(repositoryPath(SCENARIOS_DIRECTORY)).filter((file) => file.endsWith(MARKDOWN_EXTENSION) && file !== INDEX_FILE_NAME);
}

function parseScenario(file: string): Scenario {
  const source = readRepositoryFile(`${SCENARIOS_DIRECTORY}/${file}`);
  const frontMatter = FRONT_MATTER_PATTERN.exec(source);
  if (!frontMatter) throw new Error(`${file} has no front matter`);
  const scalars = Object.fromEntries([...frontMatter[1]!.matchAll(SCALAR_PATTERN)].map((match) => [match[1]!, match[2]!]));
  const paths = [...frontMatter[1]!.matchAll(PATH_ENTRY_PATTERN)].map((match) => match[1]!);
  return { slug: file.slice(0, -MARKDOWN_EXTENSION.length), body: source.slice(frontMatter[0].length), scalars, paths };
}

function scenarios(): Scenario[] {
  return scenarioFiles().map(parseScenario);
}

function playwrightServers(names: string[]): number {
  return names.filter((name) => name.startsWith(PLAYWRIGHT_SERVER_PREFIX)).length;
}

function claudeServerCount(): number {
  return playwrightServers(Object.keys(JSON.parse(readRepositoryFile(MCP_CONFIG_FILE)).mcpServers));
}

function codexServerCount(): number {
  return playwrightServers([...readRepositoryFile(CODEX_CONFIG_FILE).matchAll(CODEX_SERVER_PATTERN)].map((match) => match[1]!));
}

function testSections(body: string): { heading: string; expects: number }[] {
  const headings = [...body.matchAll(TEST_SECTION_PATTERN)];
  return headings.map((match, index) => {
    const next = headings[index + 1];
    const section = body.slice(match.index!, next ? next.index : undefined);
    return { heading: match[0], expects: [...section.matchAll(EXPECT_LINE_PATTERN)].length };
  });
}

function violations(scenario: Scenario): string[] {
  const missingScalars = REQUIRED_SCALARS.filter((key) => !(key in scenario.scalars)).map((key) => `${scenario.slug}: missing ${key}`);
  const noPaths = scenario.paths.length === 0 ? [`${scenario.slug}: no paths`] : [];
  const slugMismatch = scenario.scalars.name !== scenario.slug ? [`${scenario.slug}: name differs from the file name`] : [];
  const authorsNotInteger = Number.isInteger(Number(scenario.scalars.authors)) ? [] : [`${scenario.slug}: authors is not an integer`];
  const sections = testSections(scenario.body);
  const noTests = sections.length === 0 ? [`${scenario.slug}: no test`] : [];
  const expectsOff = sections
    .filter((section) => section.expects !== EXPECTS_PER_TEST)
    .map((section) => `${scenario.slug}: ${section.heading} has ${section.expects} Expect lines`);
  return [...missingScalars, ...noPaths, ...slugMismatch, ...authorsNotInteger, ...noTests, ...expectsOff];
}

describe('scenarios', () => {
  test('at least one scenario exists', () => {
    expect(scenarioFiles().length).toBeGreaterThan(0);
  });

  test('every scenario has the front matter, at least one test with one Expect and an index row', () => {
    const index = readRepositoryFile(SCENARIOS_INDEX);
    const unindexed = scenarios()
      .filter((scenario) => !index.includes(`[\`${scenario.slug}\`](${scenario.slug}${MARKDOWN_EXTENSION})`))
      .map((scenario) => `${scenario.slug}: not in the index`);
    expect([...scenarios().flatMap(violations), ...unindexed]).toEqual([]);
  });

  test('a scenario never needs more authors than there are Playwright servers', () => {
    const servers = Math.min(claudeServerCount(), codexServerCount());
    const overbooked = scenarios()
      .filter((scenario) => Number(scenario.scalars.authors) > servers)
      .map((scenario) => scenario.slug);
    expect(overbooked).toEqual([]);
  });

  test('both agent configurations declare the same number of Playwright servers', () => {
    expect(codexServerCount()).toBe(claudeServerCount());
  });
});
