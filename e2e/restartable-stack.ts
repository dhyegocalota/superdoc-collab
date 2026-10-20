import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { FAKE_OPENROUTER_ORIGIN } from './fake-openrouter-origin';
import { assertPortFree, localOrigin, SERVER_HEALTH_PATH, stackEnvironment, waitForHealth } from './stack';

export enum RestartablePort {
  ConnectionState = 3150,
  ExitConfirmation = 3160,
  LocalPreview = 3170,
}

const SEED_COMMAND = 'apps/server/dist/seed.js';
const SERVER_COMMAND = 'apps/server/dist/main.js';
const DATABASE_DIRECTORY_PREFIX = 'superdoc-collab-restartable-';
const SERVER_START_TIMEOUT_MS = 30_000;
const GRACEFUL_STOP_TIMEOUT_MS = 10_000;

const REPOSITORY_ROOT = resolve(__dirname, '..');

let origin: string | null = null;
let environment: Record<string, string> | null = null;
let server: ChildProcess | null = null;

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (!isRunning(child)) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

async function seedDatabase(seedEnvironment: Record<string, string>): Promise<void> {
  const seed = spawn('node', [SEED_COMMAND], { cwd: REPOSITORY_ROOT, stdio: 'inherit', env: { ...process.env, ...seedEnvironment } });
  const exitCode = await new Promise<number | null>((resolve) => seed.once('exit', resolve));
  if (exitCode !== 0) throw new Error(`${SEED_COMMAND} exited with ${exitCode}`);
}

export async function startRestartableStack({
  port,
  overrides = {},
}: {
  port: RestartablePort;
  overrides?: Record<string, string>;
}): Promise<string> {
  await assertPortFree(port);
  const databaseDir = mkdtempSync(join(tmpdir(), DATABASE_DIRECTORY_PREFIX));
  origin = localOrigin(port);
  environment = { ...stackEnvironment({ port, databaseDir, fakeOpenRouterOrigin: FAKE_OPENROUTER_ORIGIN }), ...overrides };
  await seedDatabase(environment);
  await startServer();
  return origin;
}

export async function startServer(): Promise<void> {
  if (!environment || !origin) throw new Error('startRestartableStack must run before startServer');
  if (server && isRunning(server)) throw new Error('The restartable server is already running');
  server = spawn('node', [SERVER_COMMAND], { cwd: REPOSITORY_ROOT, stdio: 'inherit', env: { ...process.env, ...environment } });
  await waitForHealth({ url: `${origin}${SERVER_HEALTH_PATH}`, timeoutMs: SERVER_START_TIMEOUT_MS });
}

export async function ensureServerRunning(): Promise<void> {
  if (server && isRunning(server)) return;
  await startServer();
}

export async function stopServer(): Promise<void> {
  if (!server || !isRunning(server)) return;
  const stopping = server;
  stopping.kill('SIGTERM');
  const exited = waitForExit(stopping).then(() => true);
  const gracePeriod = delay(GRACEFUL_STOP_TIMEOUT_MS, undefined, { ref: false }).then(() => false);
  const exitedGracefully = await Promise.race([exited, gracePeriod]);
  if (exitedGracefully) return;
  stopping.kill('SIGKILL');
  await waitForExit(stopping);
}

export async function stopRestartableStack(): Promise<void> {
  await stopServer();
  environment = null;
  server = null;
}
