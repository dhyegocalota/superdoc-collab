import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from '../testing/repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const DOCKER_JOB_FRAGMENTS = ['\n  docker:\n', 'file: docker/Dockerfile', 'push: false', 'cache-from: type=gha', "grep -q 'Missing environment variable: DEMO_PASSWORD'", '/api/health', '--max-time 5', '--retry-max-time 120', 'stat -c %u /data', '/api/auth/sign-in/email', 'docker restart app', "grep -q 'existing: ana@example.com' app.log"];
const UNIT_STEP_REQUIRING_DOCKER_COMPOSE = "      - run: pnpm test:unit\n        env:\n          REQUIRE_DOCKER_COMPOSE: 'true'\n";

describe('CI workflow', () => {
  test('a docker job builds the image without pushing it, boots it and restarts it', () => {
    const workflow = readRepositoryFile(WORKFLOW_FILE);
    expect(DOCKER_JOB_FRAGMENTS.filter((fragment) => !workflow.includes(fragment))).toEqual([]);
  });

  test('the verify job requires Docker Compose for the unit tests', () => {
    expect(readRepositoryFile(WORKFLOW_FILE)).toContain(UNIT_STEP_REQUIRING_DOCKER_COMPOSE);
  });
});
