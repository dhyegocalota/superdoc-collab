import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from './repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const DOCKER_JOB_START = '\n  docker:\n';
const NEXT_JOB_PATTERN = /\n {2}\S[^\n]*:\n/;
const WORKFLOW_PERMISSIONS = '\npermissions:\n  contents: read\n';
const JOBS_START = '\njobs:\n';
const FORBIDDEN_DOCKER_JOB_FRAGMENTS = ['\n    needs:', 'secrets.', 'docker restart'];

function dockerJob(): string {
  const workflow = readRepositoryFile(WORKFLOW_FILE);
  const start = workflow.indexOf(DOCKER_JOB_START);
  if (start === -1) throw new Error(`${WORKFLOW_FILE} has no docker job`);
  const rest = workflow.slice(start + DOCKER_JOB_START.length);
  const next = rest.search(NEXT_JOB_PATTERN);
  return next === -1 ? rest : rest.slice(0, next);
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
});
