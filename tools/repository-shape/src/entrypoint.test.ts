import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { repositoryPath } from './repository-files';

const ENTRYPOINT = repositoryPath('docker/entrypoint.sh');
const SEED_OUTPUT = 'seed ran\n';
const MAIN_OUTPUT = 'main ran\n';
const NO_LIMIT_OUTPUT = 'memory limit none, heap node default\n';
const MISSING_LIMIT_FILE = '/nonexistent/memory-limit';
const SEED_FAILURE_EXIT_CODE = 3;
const DEMO_PASSWORD = 'entrypoint-test-password';

type EntrypointRun = { status: number | null; stdout: string; stderr: string };

let workingDirectory: string;

function writeStub({ name, source }: { name: string; source: string }): void {
  writeFileSync(join(workingDirectory, 'dist', name), source);
}

function runEntrypoint(variables: Record<string, string>): EntrypointRun {
  const result = spawnSync('sh', [ENTRYPOINT], {
    cwd: workingDirectory,
    env: { PATH: process.env.PATH, CGROUP_V2_LIMIT_FILE: MISSING_LIMIT_FILE, CGROUP_V1_LIMIT_FILE: MISSING_LIMIT_FILE, ...variables },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeEach(() => {
  workingDirectory = mkdtempSync(join(tmpdir(), 'superdoc-entrypoint-'));
  mkdirSync(join(workingDirectory, 'dist'));
  writeStub({ name: 'seed.js', source: `process.stdout.write(${JSON.stringify(SEED_OUTPUT)});` });
  writeStub({ name: 'main.js', source: `process.stdout.write(${JSON.stringify(MAIN_OUTPUT)});` });
});

afterEach(() => {
  rmSync(workingDirectory, { recursive: true, force: true });
});

describe('docker entrypoint', () => {
  test('starts the server without seeding or a demo password when seeding is off', () => {
    expect(runEntrypoint({ SEED_DEMO_USERS: 'false' })).toEqual({ status: 0, stdout: NO_LIMIT_OUTPUT + MAIN_OUTPUT, stderr: '' });
  });

  test('seeds the demo users and then starts the server when seeding is on', () => {
    expect(runEntrypoint({ SEED_DEMO_USERS: 'true', DEMO_PASSWORD })).toEqual({
      status: 0,
      stdout: SEED_OUTPUT + NO_LIMIT_OUTPUT + MAIN_OUTPUT,
      stderr: '',
    });
  });

  test('refuses to seed without a demo password and starts nothing', () => {
    const run = runEntrypoint({ SEED_DEMO_USERS: 'true' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('Missing environment variable: DEMO_PASSWORD');
  });

  test('refuses to seed with an empty demo password', () => {
    const run = runEntrypoint({ SEED_DEMO_USERS: 'true', DEMO_PASSWORD: '' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('Missing environment variable: DEMO_PASSWORD');
  });

  test('refuses to start when the seeding flag is missing', () => {
    const run = runEntrypoint({});
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain("SEED_DEMO_USERS must be true or false, received: ''");
  });

  test('refuses a seeding flag that is not exactly true or false', () => {
    const run = runEntrypoint({ SEED_DEMO_USERS: 'TRUE', DEMO_PASSWORD });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain("SEED_DEMO_USERS must be true or false, received: 'TRUE'");
  });

  test('does not start the server when seeding fails', () => {
    writeStub({ name: 'seed.js', source: `process.exit(${SEED_FAILURE_EXIT_CODE});` });
    expect(runEntrypoint({ SEED_DEMO_USERS: 'true', DEMO_PASSWORD })).toEqual({ status: SEED_FAILURE_EXIT_CODE, stdout: '', stderr: '' });
  });

  test.each([
    ['1073741824', 'memory limit 1024 MB, heap 716 MB'],
    ['max', 'memory limit none, heap node default'],
    ['9223372036854771712', 'memory limit none, heap node default'],
  ])('reads the limit %s and prints %s', (limit, line) => {
    const limitFile = join(workingDirectory, 'memory.max');
    writeFileSync(limitFile, `${limit}\n`);
    expect(runEntrypoint({ SEED_DEMO_USERS: 'false', CGROUP_V2_LIMIT_FILE: limitFile }).stdout).toBe(`${line}\n${MAIN_OUTPUT}`);
  });

  test('starts the server with a heap of 70 percent and gives the projection worker 50 percent of the limit', () => {
    const limitFile = join(workingDirectory, 'memory.max');
    writeFileSync(limitFile, '1073741824\n');
    writeStub({
      name: 'main.js',
      source: 'process.stdout.write(process.execArgv.join(" ") + " " + process.env.PROJECTION_WORKER_HEAP_MEGABYTES);',
    });
    expect(runEntrypoint({ SEED_DEMO_USERS: 'false', CGROUP_V2_LIMIT_FILE: limitFile }).stdout).toContain('--max-old-space-size=716 512');
  });

  test('falls back to the version 1 limit file when the version 2 one is missing', () => {
    const limitFile = join(workingDirectory, 'memory.limit_in_bytes');
    writeFileSync(limitFile, '536870912\n');
    expect(runEntrypoint({ SEED_DEMO_USERS: 'false', CGROUP_V1_LIMIT_FILE: limitFile }).stdout).toContain(
      'memory limit 512 MB, heap 358 MB',
    );
  });
});
