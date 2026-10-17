import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from '../testing/repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const JOB_LINE_PATTERN = /^ {2}[\w-]+:$/;
const JOB_INDENT_LENGTH = 2;
const NEXT_JOB_PATTERN = /\n {2}\S[^\n]*:\n/;
const EXPECTED_JOBS = ['typecheck', 'unit', 'e2e', 'docker'];
const NODE_JOBS = ['typecheck', 'unit', 'e2e'];
const DOCKER_JOB = 'docker';
const UNIT_JOB = 'unit';
const END_TO_END_JOB = 'e2e';
const INSTALL_ACTION = 'uses: ./.github/actions/install';
const NEEDS_KEY = 'needs:';
const TIMEOUT_PATTERN = /timeout-minutes: (\d+)/;
const MAXIMUM_TIMEOUT_MINUTES = 20;
const WORKFLOW_PERMISSIONS = '\npermissions:\n  contents: read\n';
const JOBS_START = '\njobs:\n';
const UNIT_MATRIX_ENTRIES = ['{ name: libs, filter: ./libs/* }', '{ name: web, filter: "@superdoc-history/web" }', '{ name: server, filter: "@superdoc-history/server" }'];
const UNIT_FILTER_STEP = 'run: pnpm --filter "${{ matrix.filter }}" test:unit';
const DOCKER_COMPOSE_REQUIREMENT = 'REQUIRE_DOCKER_COMPOSE: ${{ matrix.name == \'server\' }}';
const FAIL_FAST_DISABLED = 'fail-fast: false';
const PLAYWRIGHT_INSTALL = 'pnpm exec playwright install --with-deps chromium';
const TIMEOUT_OCCURRENCES = 4;
const STRICT_SHELL_OPTIONS = 'set -euo pipefail';
const LENIENT_SHELL_OPTIONS = 'set -eu\n';
const FORBIDDEN_DOCKER_JOB_FRAGMENTS = ['\n    needs:', 'secrets.', 'docker restart'];
const VOLUME_MOUNT = '-v superdoc-ci-data:/data';
const SIGN_IN_ENDPOINT = '/api/auth/sign-in/email';
const SIGN_IN_TIMEOUT = '--max-time 10';
const LINE_SEPARATOR = '\n';
const DOCKER_JOB_FRAGMENTS = ['actions/checkout@v4', 'docker/setup-buildx-action@v3', 'docker/build-push-action@v6', 'file: docker/Dockerfile', 'push: false', 'load: true', 'cache-from: type=gha', 'cache-to: type=gha,mode=max', "grep -q 'Missing environment variable: DEMO_PASSWORD'", '/api/health', '--max-time 5', '--retry-max-time 120', 'stat -c %u /data', '/api/auth/sign-in/email', 'docker rm -f app', "grep -q 'existing: ana@example.com' app.log"];

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
  test('the docker job builds the image without pushing it, boots it and restarts it', () => {
    const job = dockerJob();
    expect(DOCKER_JOB_FRAGMENTS.filter((fragment) => !job.includes(fragment))).toEqual([]);
  });

  test('the docker job needs no other job and no secret', () => {
    const job = dockerJob();
    expect(FORBIDDEN_DOCKER_JOB_FRAGMENTS.filter((fragment) => job.includes(fragment))).toEqual([]);
  });

  test('the redeploy runs the same image again on the same named volume', () => {
    const mounts = dockerJob().split(LINE_SEPARATOR).filter((line) => line.includes(VOLUME_MOUNT));
    expect(mounts).toHaveLength(2);
  });

  test('every sign-in request is bounded', () => {
    const signIns = dockerJob().split(LINE_SEPARATOR).filter((line) => line.includes(SIGN_IN_ENDPOINT));
    expect(signIns).toHaveLength(2);
    expect(signIns.filter((line) => !line.includes(SIGN_IN_TIMEOUT))).toEqual([]);
  });

  test('the docker job has a bounded timeout', () => {
    const match = TIMEOUT_PATTERN.exec(dockerJob());
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeLessThanOrEqual(MAXIMUM_TIMEOUT_MINUTES);
  });

  test('multi-line steps fail on any command in a pipeline', () => {
    const job = dockerJob();
    expect(job).toContain(STRICT_SHELL_OPTIONS);
    expect(job).not.toContain(LENIENT_SHELL_OPTIONS);
  });

  test('the workflow grants the token read access to the contents only', () => {
    const workflow = readRepositoryFile(WORKFLOW_FILE);
    expect(workflow).toContain(WORKFLOW_PERMISSIONS);
    expect(workflow.indexOf(WORKFLOW_PERMISSIONS)).toBeLessThan(workflow.indexOf(JOBS_START));
  });

  test('the workflow runs exactly the typecheck, unit, e2e and docker jobs', () => {
    expect(jobNames()).toEqual(EXPECTED_JOBS);
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

  test('the e2e job installs Chromium with its system dependencies', () => {
    expect(job(END_TO_END_JOB)).toContain(PLAYWRIGHT_INSTALL);
  });

  test('every job has a bounded timeout', () => {
    const timeouts = Array.from(readRepositoryFile(WORKFLOW_FILE).matchAll(new RegExp(TIMEOUT_PATTERN, 'g')), (match) => Number(match[1]));
    expect(timeouts).toHaveLength(TIMEOUT_OCCURRENCES);
    expect(timeouts.filter((minutes) => minutes > MAXIMUM_TIMEOUT_MINUTES)).toEqual([]);
  });
});
