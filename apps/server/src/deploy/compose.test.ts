import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { composeVariables, capturedNames, DEPLOY_COMPOSE_FILE, readRepositoryFile, REPOSITORY_ROOT } from '../testing/repository-files';

const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const NO_ENVIRONMENT_FILE = '/dev/null';
const SERVICE_NAME = 'app';
const CONTAINER_PORT = '3000';
const DATA_DIRECTORY = '/data';
const DATA_VOLUME = 'superdoc-data';
const REQUIRED_VARIABLES = ['APP_ORIGIN', 'AUTH_SECRET', 'SEED_DEMO_USERS'];
const OPTIONAL_VARIABLES = ['DEMO_PASSWORD', 'OPENROUTER_API_KEY', 'LLM_MODEL', 'OPENROUTER_BASE_URL', 'LLM_MAX_CONCURRENT_JOBS', 'LLM_MAX_CALLS_PER_HOUR'];
const DOCUMENTED_VARIABLE_PATTERN = /^([A-Z_]+)=/gm;
const EMPTY_OPENROUTER_KEY_PATTERN = /^OPENROUTER_API_KEY=$/m;
const OPENROUTER_KEY_PATTERN = 'sk-or-v1-[A-Za-z0-9]{16,}';
const GIT_GREP_NO_MATCH_STATUS = 1;
const COMMAND_TIMEOUT_MILLISECONDS = 30_000;
const DOCKER_COMPOSE_REQUIREMENT_VARIABLE = 'REQUIRE_DOCKER_COMPOSE';
const DOCKER_COMPOSE_REQUIRED = 'true';
const DOCKER_COMPOSE_REQUIRED_MESSAGE = 'Docker Compose v2 is required in CI';
const REQUIRED_VALUES: Record<string, string> = {
  APP_ORIGIN: 'https://demo.example.com',
  AUTH_SECRET: 'compose-test-secret-with-at-least-32-characters',
  SEED_DEMO_USERS: 'false',
};
const DOKPLOY_VALUES: Record<string, string> = {
  ...REQUIRED_VALUES,
  SEED_DEMO_USERS: 'true',
  DEMO_PASSWORD: 'compose-test-demo-password',
  OPENROUTER_API_KEY: 'compose-test-openrouter-key',
};

type ComposeVolume = { type: string; source: string; target: string };
type ComposeService = {
  build: { context: string; dockerfile: string };
  environment: Record<string, string>;
  expose?: string[];
  ports?: unknown[];
  env_file?: unknown;
  healthcheck?: unknown;
  volumes?: ComposeVolume[];
  restart?: string;
};
type ComposeConfig = { services: Record<string, ComposeService> };
type ComposeRun = { status: number | null; stdout: string; stderr: string };

const isDockerComposeAvailable = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: COMMAND_TIMEOUT_MILLISECONDS }).status === 0;
const isDockerComposeRequired = process.env[DOCKER_COMPOSE_REQUIREMENT_VARIABLE] === DOCKER_COMPOSE_REQUIRED;

if (isDockerComposeRequired && !isDockerComposeAvailable) throw new Error(DOCKER_COMPOSE_REQUIRED_MESSAGE);

function renderCompose(variables: Record<string, string>): ComposeRun {
  const result = spawnSync('docker', ['compose', '--env-file', NO_ENVIRONMENT_FILE, '-f', DEPLOY_COMPOSE_FILE, 'config', '--format', 'json'], { cwd: REPOSITORY_ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...variables }, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MILLISECONDS });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function renderedService(variables: Record<string, string>): ComposeService {
  const run = renderCompose(variables);
  if (run.status !== 0) throw new Error(run.stderr);
  const service = (JSON.parse(run.stdout) as ComposeConfig).services[SERVICE_NAME];
  if (!service) throw new Error(`The compose file has no service named ${SERVICE_NAME}`);
  return service;
}

function withoutVariable(name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(DOKPLOY_VALUES).filter(([key]) => key !== name));
}

describe('Dokploy compose file', () => {
  test('reads exactly the required and optional variables from the environment', () => {
    expect(composeVariables().sort()).toEqual([...REQUIRED_VARIABLES, ...OPTIONAL_VARIABLES].sort());
  });

  test('every variable read from the environment is documented in the example file', () => {
    const documented = capturedNames({ text: readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE), pattern: DOCUMENTED_VARIABLE_PATTERN });
    expect(composeVariables().filter((name) => !documented.includes(name))).toEqual([]);
  });

  test('the example file leaves the OpenRouter key empty', () => {
    expect(readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE)).toMatch(EMPTY_OPENROUTER_KEY_PATTERN);
  });

  test('no OpenRouter key is committed', () => {
    expect(spawnSync('git', ['grep', '-nE', OPENROUTER_KEY_PATTERN], { cwd: REPOSITORY_ROOT, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MILLISECONDS }).status).toBe(GIT_GREP_NO_MATCH_STATUS);
  });
});

describe.skipIf(!isDockerComposeAvailable)('Dokploy compose file rendered by docker compose (skipped without the Docker CLI)', () => {
  test('builds the repository image and reaches the app only through the proxy network', () => {
    const service = renderedService(DOKPLOY_VALUES);
    expect(service.build).toEqual(expect.objectContaining({ context: REPOSITORY_ROOT, dockerfile: 'docker/Dockerfile' }));
    expect(service.expose).toEqual([CONTAINER_PORT]);
    expect(service.ports).toBeUndefined();
    expect(service.env_file).toBeUndefined();
    expect(service.healthcheck).toBeUndefined();
    expect(service.restart).toBe('unless-stopped');
  });

  test('keeps the data directory on a named volume', () => {
    expect(renderedService(DOKPLOY_VALUES).volumes).toEqual([expect.objectContaining({ type: 'volume', source: DATA_VOLUME, target: DATA_DIRECTORY })]);
  });

  test('pins the production values that must match the image and the proxy', () => {
    expect(renderedService(DOKPLOY_VALUES).environment).toEqual(expect.objectContaining({ PORT: CONTAINER_PORT, DATABASE_DIR: DATA_DIRECTORY, WEB_DIST_DIR: '/app/web', TRUST_PROXY: 'true' }));
  });

  test('reads every secret from the Dokploy environment', () => {
    expect(renderedService(DOKPLOY_VALUES).environment).toEqual(expect.objectContaining(DOKPLOY_VALUES));
  });

  test('passes optional variables as empty when Dokploy does not set them', () => {
    const environment = renderedService(REQUIRED_VALUES).environment;
    expect(OPTIONAL_VARIABLES.map((name) => [name, environment[name]])).toEqual(OPTIONAL_VARIABLES.map((name) => [name, '']));
  });

  test.each(REQUIRED_VARIABLES)('refuses to render without %s', (name) => {
    const run = renderCompose(withoutVariable(name));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`required variable ${name} is missing a value`);
  });
});
