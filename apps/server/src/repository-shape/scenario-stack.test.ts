import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, REPOSITORY_ROOT } from './repository-files';

const PLAYWRIGHT_CONFIG_FILE = 'playwright.config.ts';
const PACKAGE_FILE = 'package.json';
const STACK_MODULE_IMPORT = "from './e2e/stack'";
const INLINE_BUILD_COMMAND = 'BUILD_AND_START_COMMAND = [';
const SCENARIO_STACK_SCRIPT = 'scenario:stack';
const SCENARIO_STACK_COMMAND = 'tsx e2e/scenario-stack.ts';
const SCENARIO_PORT = 3200;
const DATABASE_DIRECTORY = '/tmp/scenario-stack-test';
const FAKE_OPENROUTER_ORIGIN = 'http://127.0.0.1:3299';
const EXPECTED_KEYS = [
  'PORT',
  'APP_ORIGIN',
  'AUTH_SECRET',
  'DATABASE_DIR',
  'TRUST_PROXY',
  'DEMO_PASSWORD',
  'WEB_DIST_DIR',
  'LLM_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_BASE_URL',
  'LLM_MAX_CONCURRENT_JOBS',
  'LLM_MAX_CALLS_PER_HOUR',
];
const PRINT_ENVIRONMENT_SCRIPT = `import('./e2e/stack.ts').then((stack) => console.log(JSON.stringify(stack.stackEnvironment(${JSON.stringify({ port: SCENARIO_PORT, databaseDir: DATABASE_DIRECTORY, fakeOpenRouterOrigin: FAKE_OPENROUTER_ORIGIN })}))))`;

function stackEnvironment(): Record<string, string> {
  const output = execFileSync('node', ['-e', PRINT_ENVIRONMENT_SCRIPT], { cwd: REPOSITORY_ROOT, encoding: 'utf8' });
  return JSON.parse(output);
}

describe('scenario stack', () => {
  test('the stack environment carries the keys the E2E config sets', () => {
    const environment = stackEnvironment();
    expect(Object.keys(environment).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(environment.PORT).toBe(String(SCENARIO_PORT));
    expect(environment.APP_ORIGIN).toBe(`http://127.0.0.1:${SCENARIO_PORT}`);
    expect(environment.DATABASE_DIR).toBe(DATABASE_DIRECTORY);
    expect(environment.OPENROUTER_BASE_URL).toBe(`${FAKE_OPENROUTER_ORIGIN}/api/v1`);
  });

  test('playwright.config.ts boots through the shared stack module', () => {
    const config = readRepositoryFile(PLAYWRIGHT_CONFIG_FILE);
    expect(config).toContain(STACK_MODULE_IMPORT);
    expect(config).not.toContain(INLINE_BUILD_COMMAND);
  });

  test('the scenario stack script is reachable through pnpm', () => {
    expect(JSON.parse(readRepositoryFile(PACKAGE_FILE)).scripts[SCENARIO_STACK_SCRIPT]).toBe(SCENARIO_STACK_COMMAND);
  });
});
