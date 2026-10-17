import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from './repository-files';

const PACKAGE_FILE = 'package.json';
const DEPENDABOT_FILE = '.github/dependabot.yml';
const GITLEAKS_FILE = '.gitleaks.toml';
const SECURITY_AUDIT_SCRIPT = 'security:audit';
const SECURITY_AUDIT_COMMAND = 'pnpm audit --prod --audit-level=high';
const VERIFY_SCRIPT = 'verify';
const VERIFY_PREFIX = 'pnpm typecheck && pnpm security:audit && pnpm test:unit';
const DEPENDABOT_ECOSYSTEMS = ['package-ecosystem: npm', 'package-ecosystem: github-actions'];
const WEEKLY_INTERVAL = 'interval: weekly';
const GITLEAKS_DEFAULT_RULES = 'useDefault = true';

function scripts(): Record<string, string> {
  return JSON.parse(readRepositoryFile(PACKAGE_FILE)).scripts;
}

describe('security configuration', () => {
  test('the security audit script gates production dependencies at high', () => {
    expect(scripts()[SECURITY_AUDIT_SCRIPT]).toBe(SECURITY_AUDIT_COMMAND);
  });

  test('verify runs the security audit right after the typecheck', () => {
    expect(scripts()[VERIFY_SCRIPT]).toContain(VERIFY_PREFIX);
  });

  test('dependabot watches npm and github actions weekly', () => {
    const dependabot = readRepositoryFile(DEPENDABOT_FILE);
    expect(DEPENDABOT_ECOSYSTEMS.filter((ecosystem) => !dependabot.includes(ecosystem))).toEqual([]);
    expect(dependabot.split(WEEKLY_INTERVAL).length - 1).toBe(DEPENDABOT_ECOSYSTEMS.length);
  });

  test('gitleaks extends the default rules', () => {
    expect(readRepositoryFile(GITLEAKS_FILE)).toContain(GITLEAKS_DEFAULT_RULES);
  });
});
