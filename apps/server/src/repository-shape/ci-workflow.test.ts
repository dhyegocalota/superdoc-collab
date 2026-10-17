import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from './repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const JOB_LINE_PATTERN = /^ {2}[\w-]+:$/;
const JOB_INDENT_LENGTH = 2;
const NEXT_JOB_PATTERN = /\n {2}\S[^\n]*:\n/;
const EXPECTED_JOBS = ['checks', 'unit', 'docker', 'security'];
const NODE_JOBS = ['checks', 'unit', 'security'];
const CHECKS_JOB = 'checks';
const CHECKS_STEPS = ['run: pnpm format:check', 'run: pnpm typecheck', 'run: pnpm test:hooks'];
const DOCKER_JOB = 'docker';
const SECURITY_JOB = 'security';
const SECURITY_STEPS = [
  'run: pnpm security:audit',
  'sha256sum --check --strict',
  'run: .github/scripts/secret-rules-probe.sh ./gitleaks',
  'run: ./gitleaks git --no-banner --redact --exit-code 1 .',
];
const FULL_HISTORY_CHECKOUT = 'fetch-depth: 0';
const UNIT_JOB = 'unit';
const INSTALL_ACTION = 'uses: ./.github/actions/install';
const NEEDS_KEY = 'needs:';
const TIMEOUT_PATTERN = /timeout-minutes: (\d+)/;
const MAXIMUM_TIMEOUT_MINUTES = 20;
const WORKFLOW_PERMISSIONS = '\npermissions:\n  contents: read\n';
const JOBS_START = '\njobs:\n';
const LINE_SEPARATOR = '\n';
const UNIT_MATRIX_ENTRIES = [
  '{ name: libs, filter: ./libs/* }',
  '{ name: web, filter: "@superdoc-collab/web" }',
  '{ name: server, filter: "@superdoc-collab/server" }',
];
const UNIT_FILTER_STEP = 'run: pnpm --filter "${{ matrix.filter }}" test:unit';
const DOCKER_COMPOSE_REQUIREMENT = "REQUIRE_DOCKER_COMPOSE: ${{ matrix.name == 'server' }}";
const FAIL_FAST_DISABLED = 'fail-fast: false';
const FORBIDDEN_DOCKER_JOB_FRAGMENTS = ['\n    needs:', 'secrets.', 'docker restart'];
const TOKEN_REFERENCE = 'secrets.';

function job(name: string): string {
  const workflow = readRepositoryFile(WORKFLOW_FILE);
  const jobStart = `\n  ${name}:\n`;
  const start = workflow.indexOf(jobStart);
  if (start === -1) throw new Error(`${WORKFLOW_FILE} has no ${name} job`);
  const rest = workflow.slice(start + jobStart.length);
  const next = rest.search(NEXT_JOB_PATTERN);
  return next === -1 ? rest : rest.slice(0, next);
}

function dockerJob(): string {
  return job(DOCKER_JOB);
}

function jobNames(): string[] {
  const workflow = readRepositoryFile(WORKFLOW_FILE);
  const jobs = workflow.slice(workflow.indexOf(JOBS_START));
  return jobs
    .split(LINE_SEPARATOR)
    .filter((line) => JOB_LINE_PATTERN.test(line))
    .map((line) => line.slice(JOB_INDENT_LENGTH, -1));
}

describe('CI workflow', () => {
  test('the docker job needs no other job and no secret', () => {
    const job = dockerJob();
    expect(FORBIDDEN_DOCKER_JOB_FRAGMENTS.filter((fragment) => job.includes(fragment))).toEqual([]);
  });

  test('the workflow grants the token read access to the contents only', () => {
    const workflow = readRepositoryFile(WORKFLOW_FILE);
    expect(workflow).toContain(WORKFLOW_PERMISSIONS);
    expect(workflow.indexOf(WORKFLOW_PERMISSIONS)).toBeLessThan(workflow.indexOf(JOBS_START));
  });

  test('the workflow runs exactly the checks, unit, docker and security jobs', () => {
    expect(jobNames()).toEqual(EXPECTED_JOBS);
  });

  test('the checks job checks the formatting, typechecks and tests the hooks', () => {
    const checks = job(CHECKS_JOB);
    expect(CHECKS_STEPS.filter((step) => !checks.includes(step))).toEqual([]);
  });

  test('the security job audits production dependencies and scans the full history for secrets without a token', () => {
    const security = job(SECURITY_JOB);
    expect(SECURITY_STEPS.filter((step) => !security.includes(step))).toEqual([]);
    expect(security).toContain(FULL_HISTORY_CHECKOUT);
    expect(security).not.toContain(TOKEN_REFERENCE);
  });

  test('no job waits for another job', () => {
    expect(readRepositoryFile(WORKFLOW_FILE)).not.toContain(NEEDS_KEY);
  });

  test('the Node jobs install through the composite action and the docker job does not', () => {
    expect(NODE_JOBS.filter((name) => !job(name).includes(INSTALL_ACTION))).toEqual([]);
    expect(dockerJob()).not.toContain(INSTALL_ACTION);
  });

  test('the unit matrix lists the libs, web and server packages', () => {
    const unit = job(UNIT_JOB);
    expect(UNIT_MATRIX_ENTRIES.filter((entry) => !unit.includes(entry))).toEqual([]);
  });

  test('the unit step filters by the quoted matrix filter', () => {
    expect(job(UNIT_JOB)).toContain(UNIT_FILTER_STEP);
  });

  test('only the server unit matrix entry requires Docker Compose', () => {
    expect(job(UNIT_JOB)).toContain(DOCKER_COMPOSE_REQUIREMENT);
  });

  test('a failing unit matrix entry does not cancel the others', () => {
    expect(job(UNIT_JOB)).toContain(FAIL_FAST_DISABLED);
  });

  test('every job has a bounded timeout', () => {
    const unbounded = EXPECTED_JOBS.filter((name) => {
      const match = TIMEOUT_PATTERN.exec(job(name));
      return match === null || Number(match[1]) > MAXIMUM_TIMEOUT_MINUTES;
    });
    expect(unbounded).toEqual([]);
  });
});
