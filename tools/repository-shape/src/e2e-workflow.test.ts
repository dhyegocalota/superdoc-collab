import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from './repository-files';

const WORKFLOW_FILE = '.github/workflows/e2e.yml';
const MANUAL_TRIGGER = '\non:\n  workflow_dispatch:\n';
const AUTOMATIC_TRIGGERS = ['pull_request', 'push:'];
const JOB_LINE_PATTERN = /^ {2}[\w-]+:$/;
const JOB_INDENT_LENGTH = 2;
const EXPECTED_JOBS = ['e2e'];
const INSTALL_ACTION = 'uses: ./.github/actions/install';
const PLAYWRIGHT_INSTALL = 'pnpm exec playwright install --with-deps chromium';
const END_TO_END_STEP = 'run: pnpm test:e2e';
const TIMEOUT_PATTERN = /timeout-minutes: (\d+)/;
const MAXIMUM_TIMEOUT_MINUTES = 20;
const WORKFLOW_PERMISSIONS = '\npermissions:\n  contents: read\n';
const JOBS_START = '\njobs:\n';
const LINE_SEPARATOR = '\n';

function workflow(): string {
  return readRepositoryFile(WORKFLOW_FILE);
}

function jobNames(): string[] {
  const text = workflow();
  return text
    .slice(text.indexOf(JOBS_START))
    .split(LINE_SEPARATOR)
    .filter((line) => JOB_LINE_PATTERN.test(line))
    .map((line) => line.slice(JOB_INDENT_LENGTH, -1));
}

describe('E2E workflow', () => {
  test('it runs only when someone dispatches it', () => {
    const text = workflow();
    expect(text).toContain(MANUAL_TRIGGER);
    expect(AUTOMATIC_TRIGGERS.filter((trigger) => text.includes(trigger))).toEqual([]);
  });

  test('it has one e2e job that installs through the composite action and runs the suite', () => {
    expect(jobNames()).toEqual(EXPECTED_JOBS);
    expect(workflow()).toContain(INSTALL_ACTION);
    expect(workflow()).toContain(PLAYWRIGHT_INSTALL);
    expect(workflow()).toContain(END_TO_END_STEP);
  });

  test('it grants the token read access to the contents only and bounds its timeout', () => {
    const text = workflow();
    expect(text).toContain(WORKFLOW_PERMISSIONS);
    expect(text.indexOf(WORKFLOW_PERMISSIONS)).toBeLessThan(text.indexOf(JOBS_START));
    const match = TIMEOUT_PATTERN.exec(text);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeLessThanOrEqual(MAXIMUM_TIMEOUT_MINUTES);
  });
});
