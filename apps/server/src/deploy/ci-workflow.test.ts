import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from '../testing/repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const DOCKER_JOB_START = '\n  docker:\n';
const NEXT_JOB_PATTERN = /\n {2}\S[^\n]*:\n/;
const TIMEOUT_PATTERN = /timeout-minutes: (\d+)/;
const MAXIMUM_TIMEOUT_MINUTES = 20;
const WORKFLOW_PERMISSIONS = '\npermissions:\n  contents: read\n';
const JOBS_START = '\njobs:\n';
const UNIT_STEP_PATTERN = /- run: pnpm test:unit\s+env:\s+REQUIRE_DOCKER_COMPOSE: 'true'/;
const STRICT_SHELL_OPTIONS = 'set -euo pipefail';
const LENIENT_SHELL_OPTIONS = 'set -eu\n';
const FORBIDDEN_DOCKER_JOB_FRAGMENTS = ['\n    needs:', 'secrets.'];
const DOCKER_JOB_FRAGMENTS = ['actions/checkout@v4', 'docker/setup-buildx-action@v3', 'docker/build-push-action@v6', 'file: docker/Dockerfile', 'push: false', 'load: true', 'cache-from: type=gha', 'cache-to: type=gha,mode=max', "grep -q 'Missing environment variable: DEMO_PASSWORD'", '/api/health', '--max-time 5', '--retry-max-time 120', 'stat -c %u /data', '/api/auth/sign-in/email', 'docker restart app', "grep -q 'existing: ana@example.com' app.log"];

function dockerJob(): string {
  const workflow = readRepositoryFile(WORKFLOW_FILE);
  const start = workflow.indexOf(DOCKER_JOB_START);
  if (start === -1) throw new Error(`${WORKFLOW_FILE} has no docker job`);
  const rest = workflow.slice(start + DOCKER_JOB_START.length);
  const next = rest.search(NEXT_JOB_PATTERN);
  return next === -1 ? rest : rest.slice(0, next);
}

function verifyJob(): string {
  const workflow = readRepositoryFile(WORKFLOW_FILE);
  return workflow.slice(workflow.indexOf(JOBS_START), workflow.indexOf(DOCKER_JOB_START));
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

  test('the verify job requires Docker Compose for the unit tests', () => {
    expect(verifyJob()).toMatch(UNIT_STEP_PATTERN);
  });
});
