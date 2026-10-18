import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPortFree,
  BUILD_AND_START_COMMAND,
  FAKE_OPENROUTER_COMMAND,
  FAKE_OPENROUTER_HEALTH_PATH,
  localOrigin,
  SERVER_HEALTH_PATH,
  stackEnvironment,
  waitForHealth,
} from './stack';

const SCENARIO_PORT = 3200;
const SCENARIO_FAKE_OPENROUTER_PORT = 3299;
const STACK_START_TIMEOUT_MS = 300_000;
const DATABASE_DIRECTORY_PREFIX = 'superdoc-collab-scenario-';
const STOP_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const NO_SUCH_PROCESS = 'ESRCH';

const origin = localOrigin(SCENARIO_PORT);
const fakeOpenRouterOrigin = localOrigin(SCENARIO_FAKE_OPENROUTER_PORT);
const children: ChildProcess[] = [];

function start({ command, environment }: { command: string; environment: Record<string, string> }): ChildProcess {
  const child = spawn(command, { shell: true, detached: true, stdio: 'inherit', env: { ...process.env, ...environment } });
  children.push(child);
  child.once('exit', (code) => {
    stopAll();
    process.exit(code === null ? 1 : code);
  });
  return child;
}

function isRunning(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

function stopGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    const alreadyGone = (error as NodeJS.ErrnoException).code === NO_SUCH_PROCESS;
    if (!alreadyGone) throw error;
  }
}

function stopAll(): void {
  children.filter(isRunning).forEach((child) => stopGroup(child.pid!));
}

async function main(): Promise<void> {
  await assertPortFree(SCENARIO_PORT);
  await assertPortFree(SCENARIO_FAKE_OPENROUTER_PORT);
  const databaseDir = mkdtempSync(join(tmpdir(), DATABASE_DIRECTORY_PREFIX));
  STOP_SIGNALS.forEach((signal) =>
    process.on(signal, () => {
      stopAll();
      process.exit(0);
    }),
  );
  start({ command: FAKE_OPENROUTER_COMMAND, environment: { FAKE_OPENROUTER_PORT: String(SCENARIO_FAKE_OPENROUTER_PORT) } });
  await waitForHealth({ url: `${fakeOpenRouterOrigin}${FAKE_OPENROUTER_HEALTH_PATH}`, timeoutMs: STACK_START_TIMEOUT_MS });
  start({ command: BUILD_AND_START_COMMAND, environment: stackEnvironment({ port: SCENARIO_PORT, databaseDir, fakeOpenRouterOrigin }) });
  await waitForHealth({ url: `${origin}${SERVER_HEALTH_PATH}`, timeoutMs: STACK_START_TIMEOUT_MS });
  console.log(`ORIGIN=${origin}`);
  console.log(`DATABASE_DIR=${databaseDir}`);
  console.log(`PID=${process.pid}`);
}

main().catch((error: Error) => {
  stopAll();
  console.error(error.message);
  process.exit(1);
});
