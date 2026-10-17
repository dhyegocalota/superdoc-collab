import { readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, repositoryPath } from './repository-files';

const ROLES_DIRECTORY = '.agents/roles';
const CLAUDE_AGENTS_DIRECTORY = '.claude/agents';
const CODEX_AGENTS_DIRECTORY = '.codex/agents';
const CODEX_CONFIG_FILE = '.codex/config.toml';
const MARKDOWN_EXTENSION = '.md';
const TOML_EXTENSION = '.toml';
const EXPECTED_ROLES = ['developer', 'frontend-designer', 'recorder', 'researcher', 'reviewer', 'security-reviewer', 'tester'];
const VERIFY_SKILL_FILE = '.agents/skills/verify/SKILL.md';
const DOCTOR_SCRIPT_GATE = '0. `.agents/hooks/doctor.sh`';

function roleNames(): string[] {
  return readdirSync(repositoryPath(ROLES_DIRECTORY))
    .filter((file) => file.endsWith(MARKDOWN_EXTENSION))
    .map((file) => file.slice(0, -MARKDOWN_EXTENSION.length))
    .sort();
}

function wrapperNamesRole({ directory, extension, role }: { directory: string; extension: string; role: string }): boolean {
  const wrapperPath = `${directory}/${role}${extension}`;
  try {
    return readRepositoryFile(wrapperPath).includes(`${ROLES_DIRECTORY}/${role}${MARKDOWN_EXTENSION}`);
  } catch {
    return false;
  }
}

describe('agent surfaces', () => {
  test('the roles are exactly the expected ones', () => {
    expect(roleNames()).toEqual(EXPECTED_ROLES);
  });

  test('every role has a Claude Code wrapper that names its role file', () => {
    const missing = roleNames().filter(
      (role) => !wrapperNamesRole({ directory: CLAUDE_AGENTS_DIRECTORY, extension: MARKDOWN_EXTENSION, role }),
    );
    expect(missing).toEqual([]);
  });

  test('every role has a Codex wrapper that names its role file', () => {
    const missing = roleNames().filter((role) => !wrapperNamesRole({ directory: CODEX_AGENTS_DIRECTORY, extension: TOML_EXTENSION, role }));
    expect(missing).toEqual([]);
  });

  test('every role is registered in the Codex configuration', () => {
    const config = readRepositoryFile(CODEX_CONFIG_FILE);
    const missing = roleNames().filter(
      (role) => !config.includes(`[agents.${role}]\nconfig_file = "${CODEX_AGENTS_DIRECTORY}/${role}${TOML_EXTENSION}"`),
    );
    expect(missing).toEqual([]);
  });

  test('the verify skill opens with the doctor script, not the pnpm built-in of the same name', () => {
    expect(readRepositoryFile(VERIFY_SKILL_FILE)).toContain(DOCTOR_SCRIPT_GATE);
  });
});
