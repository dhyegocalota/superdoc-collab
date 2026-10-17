import { connect } from 'node:net';

export const LOOPBACK_HOST = '127.0.0.1';
const TEST_AUTH_SECRET = 'e2e-auth-secret-with-at-least-32-characters';
const DEMO_PASSWORD = 'superdoc-demo';
const WEB_DIST_DIR = 'apps/web/dist';
const LLM_MODEL = 'openai/gpt-6-luna';
const FAKE_API_KEY = 'e2e-fake-key';
const FAKE_API_PATH = '/api/v1';
const LLM_MAX_CONCURRENT_JOBS = 2;
const LLM_MAX_CALLS_PER_HOUR = 10_000;
const CONNECTION_REFUSED = 'ECONNREFUSED';
const HEALTH_POLL_INTERVAL_MS = 500;

export const FAKE_OPENROUTER_COMMAND = 'node e2e/fake-openrouter.ts';
export const FAKE_OPENROUTER_HEALTH_PATH = '/health';
export const SERVER_HEALTH_PATH = '/api/health';

export const BUILD_AND_START_COMMAND = [
  'pnpm --filter @superdoc-collab/web build',
  'pnpm --filter @superdoc-collab/server build',
  'node apps/server/dist/seed.js',
  'node apps/server/dist/main.js',
].join(' && ');

export function localOrigin(port: number): string {
  return `http://${LOOPBACK_HOST}:${port}`;
}

export function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = connect({ host: LOOPBACK_HOST, port });
    probe.once('connect', () => {
      probe.destroy();
      reject(new Error(`Port ${port} is busy; stop the process that holds it before starting a scenario stack`));
    });
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === CONNECTION_REFUSED) return resolve();
      reject(error);
    });
  });
}

async function isHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

export function waitForHealth({ url, timeoutMs }: { url: string; timeoutMs: number }): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    async function poll(): Promise<void> {
      if (await isHealthy(url)) return resolve();
      if (Date.now() > deadline) return reject(new Error(`${url} did not answer within ${timeoutMs} ms`));
      setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
    }
    void poll();
  });
}

export function stackEnvironment({
  port,
  databaseDir,
  fakeOpenRouterOrigin,
}: {
  port: number;
  databaseDir: string;
  fakeOpenRouterOrigin: string;
}): Record<string, string> {
  return {
    PORT: String(port),
    HOST: LOOPBACK_HOST,
    APP_ORIGIN: localOrigin(port),
    AUTH_SECRET: TEST_AUTH_SECRET,
    DATABASE_DIR: databaseDir,
    TRUST_PROXY: 'true',
    DEMO_PASSWORD,
    WEB_DIST_DIR,
    LLM_MODEL,
    OPENROUTER_API_KEY: FAKE_API_KEY,
    OPENROUTER_BASE_URL: `${fakeOpenRouterOrigin}${FAKE_API_PATH}`,
    LLM_MAX_CONCURRENT_JOBS: String(LLM_MAX_CONCURRENT_JOBS),
    LLM_MAX_CALLS_PER_HOUR: String(LLM_MAX_CALLS_PER_HOUR),
  };
}
