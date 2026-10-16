# Bootstrap and auth — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Author this list with every box empty. A sub-agent ticks its own line with evidence. A wrong step is struck through with the reason, not deleted.

**Spec:** [spec.md](spec.md)
**Tier:** 🔴
**Goal:** A pnpm workspace where a person signs up, signs in, lands on an empty protected workspace and signs out, with the same session trusted by the collaboration socket, in one Docker image, verified by CI.
**Architecture:** `apps/server` runs Hono and Hocuspocus 2.15.3 on one Node HTTP server; Better Auth owns users and sessions in `auth.sqlite` through Drizzle on better-sqlite3; `apps/web` is a Vite SPA served by the same server in production and proxied in development; `libs/types` holds the enums, constants and zod schemas both sides share.
**Tech stack:** Node 24, pnpm 8, TypeScript 7, Hono 4.13, @hono/node-server 2.1, better-auth 1.7, drizzle-orm 0.45, drizzle-kit 0.31, better-sqlite3 13, @hocuspocus/server 2.15.3, ws 8, zod 4, React 19, Vite 8, react-router 8, @tanstack/react-query 5, Tailwind 4 (@tailwindcss/vite), shadcn 4, react-hook-form 7, Vitest 5, Playwright 1.64.
**Seam:** nothing existing changes; `poc/` is untouched and stays green.
**Assumptions (decided, owner can override):** Better Auth session cookie name is read from the library (`better-auth.session_token`), never hard-coded; the dev server runs web on 5173 and server on 3000; production serves everything on `PORT` (default declared in `.env.example` as 3000, required at runtime).

## Global constraints

- Everything in English. No comments. No `?? default`. No `else`. Enums over string literals. Constants over magic literals. Named parameters when a function takes more than one. Function declarations. No `.js` in imports. No `sleep` in tests: wait on conditions.
- Required environment variables throw a named error when missing: `AUTH_SECRET`, `APP_ORIGIN`, `DATABASE_DIR`, `PORT`. `DEMO_PASSWORD` is required by the seed only.
- `@hocuspocus/server` pinned to `2.15.3`; `yjs` to `13.6.33` (the pair proven in `poc/`).
- Better Auth rate limiting is `enabled: true` in every environment, including tests, so the 429 path is testable.
- Credential failures return the same status and body whether the email exists or not.
- Tests run against a temporary `DATABASE_DIR` created per test file; nothing writes to the repo tree.
- No third-party managed services; GitHub Actions is the only CI.

## Review focus

Inputs the spec implies but no happy path exercises; each has a pinned test in the owning task.

1. Email with surrounding whitespace or uppercase letters on sign-in must match the account created with the lowercase email (Task 3: `normalizes email case and whitespace`).
2. A session cookie from a deleted or expired session on the WebSocket upgrade must be rejected, not treated as anonymous-but-connected (Task 5: `rejects an expired session cookie`).
3. `next` query parameter on `/sign-in` must only accept same-origin paths; `//evil.example` or `https://…` falls back to `/documents` (Task 7: `ignores an absolute next parameter`).
4. Two sign-up requests with the same email at the same time must leave one account (Task 3: `concurrent sign-ups with one email leave one user`).
5. A `DATABASE_DIR` that exists but is not writable must stop the process with a named error, not a stack trace from SQLite (Task 2: `fails with a named error when the directory is not writable`).

## File map

| Group | Owner | Paths |
|---|---|---|
| G1 workspace + shared types | developer A | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.npmrc`, `.env.example`, `libs/types/**` |
| G2 server | developer B | `apps/server/**` |
| G3 web | developer C | `apps/web/**` |
| G4 integration | developer A (after G2 and G3) | `e2e/**`, `docker/**`, `.github/workflows/verify.yml`, `README.md` |

## Sequencing

G1 first (Tasks 1). Then G2 (Tasks 2–6) ∥ G3 (Tasks 7–8), both importing `@superdoc-history/types`. Then G4 (Tasks 9–11). Then Z.

---

### Task 1: Workspace and shared types (G1)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.npmrc`, `.env.example`
- Create: `libs/types/package.json`, `libs/types/tsconfig.json`, `libs/types/vitest.config.ts`, `libs/types/src/index.ts`, `libs/types/src/routes.ts`, `libs/types/src/auth.ts`, `libs/types/src/demo-users.ts`
- Test: `libs/types/src/auth.test.ts`

**Interfaces:**
- Produces: package `@superdoc-history/types` exporting `AppRoute`, `ApiPath`, `signInSchema`, `signUpSchema`, `SignInInput`, `SignUpInput`, `DEMO_USERS`, `PASSWORD_MIN_LENGTH`, `AUTH_ERROR_MESSAGE`.

- [ ] **Step 1: Root files**

`package.json`
```json
{
  "name": "superdoc-history",
  "private": true,
  "packageManager": "pnpm@8.15.9",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "pnpm -r --parallel --filter ./apps/* dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test:unit": "pnpm -r test:unit",
    "test:e2e": "playwright test",
    "seed": "pnpm --filter @superdoc-history/server seed",
    "verify": "pnpm typecheck && pnpm test:unit && pnpm test:e2e"
  },
  "devDependencies": { "@playwright/test": "1.64.1", "typescript": "7.0.2" }
}
```
`pnpm-workspace.yaml`: `packages: ['apps/*', 'libs/*']`. `.nvmrc`: `24`. `.npmrc`: `auto-install-peers=true` and `strict-peer-dependencies=false`.
`tsconfig.base.json`: `strict`, `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2023`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `skipLibCheck: true`.
`.env.example`:
```
PORT=3000
APP_ORIGIN=http://localhost:5173
AUTH_SECRET=change-me-32-characters-minimum-secret
DATABASE_DIR=./data
DEMO_PASSWORD=superdoc-demo
```

- [ ] **Step 2: Failing test for the shared schemas**

`libs/types/src/auth.test.ts`
```ts
import { describe, expect, test } from 'vitest';
import { signInSchema, signUpSchema } from './auth';

describe('signInSchema', () => {
  test('lowercases and trims the email', () => {
    const parsed = signInSchema.parse({ email: '  Ana@Example.com ', password: 'superdoc-demo' });
    expect(parsed.email).toBe('ana@example.com');
  });
  test('rejects a password shorter than the minimum', () => {
    expect(signInSchema.safeParse({ email: 'ana@example.com', password: 'short' }).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  test('requires a name with at least two characters', () => {
    expect(signUpSchema.safeParse({ name: 'A', email: 'ana@example.com', password: 'superdoc-demo' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it, expect failure** — `pnpm --filter @superdoc-history/types test:unit` → FAIL: cannot find `./auth`.

- [ ] **Step 4: Implement**

`libs/types/src/routes.ts`
```ts
export enum AppRoute {
  SignIn = '/sign-in',
  SignUp = '/sign-up',
  Documents = '/documents',
}

export enum ApiPath {
  Health = '/api/health',
  Me = '/api/me',
  Auth = '/api/auth',
  Collaboration = '/collaboration',
}
```
`libs/types/src/auth.ts`
```ts
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MIN_LENGTH = 2;
export const AUTH_ERROR_MESSAGE = 'Invalid email or password.';

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(PASSWORD_MIN_LENGTH);

export const signInSchema = z.object({ email, password });
export const signUpSchema = signInSchema.extend({ name: z.string().trim().min(NAME_MIN_LENGTH) });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
```
`libs/types/src/demo-users.ts`
```ts
export type DemoUser = { name: string; email: string };

export const DEMO_USERS: readonly DemoUser[] = [
  { name: 'Ana', email: 'ana@example.com' },
  { name: 'Bruno', email: 'bruno@example.com' },
  { name: 'Caio', email: 'caio@example.com' },
  { name: 'Dani', email: 'dani@example.com' },
];
```
`libs/types/src/index.ts` re-exports the three files. `libs/types/package.json`: name `@superdoc-history/types`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, scripts `typecheck: tsc --noEmit`, `test:unit: vitest run`, dependencies `zod 4.6.7`, devDependencies `vitest 5.0.5`.

- [ ] **Step 5: Run it, expect pass** — same command → 3 passed. `pnpm typecheck` clean.

- [ ] **Step 6: Commit** — `git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .nvmrc .npmrc .env.example libs/types` · `chore(workspace): add the pnpm workspace and shared types`

---

### Task 2: Server configuration and database (G2)

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`, `apps/server/drizzle.config.ts`
- Create: `apps/server/src/config/environment.ts`, `apps/server/src/database/connection.ts`, `apps/server/src/database/migrate.ts`, `apps/server/src/database/schema/auth.ts`, `apps/server/drizzle/` (generated migrations)
- Test: `apps/server/src/config/environment.test.ts`, `apps/server/src/database/connection.test.ts`

**Interfaces:**
- Produces: `loadEnvironment(source: NodeJS.ProcessEnv): Environment` with `Environment = { port: number; appOrigin: string; authSecret: string; databaseDirectory: string }`; `MissingEnvironmentVariableError`; `openDatabase({ directory, fileName }): AuthDatabase` where `AuthDatabase = { sqlite: Database; drizzle: BetterSQLite3Database<typeof authSchema> }`; `runMigrations(database: AuthDatabase): void`; `DatabaseDirectoryNotWritableError`; `AUTH_DATABASE_FILE = 'auth.sqlite'`.

- [ ] **Step 1: Failing tests**

`environment.test.ts`
```ts
import { describe, expect, test } from 'vitest';
import { MissingEnvironmentVariableError, loadEnvironment } from './environment';

const complete = { PORT: '3000', APP_ORIGIN: 'http://localhost:5173', AUTH_SECRET: 'x'.repeat(32), DATABASE_DIR: '/tmp/data' };

describe('loadEnvironment', () => {
  test('parses a complete environment', () => {
    expect(loadEnvironment(complete)).toEqual({ port: 3000, appOrigin: 'http://localhost:5173', authSecret: 'x'.repeat(32), databaseDirectory: '/tmp/data' });
  });
  test.each(Object.keys(complete))('names %s when it is missing', (name) => {
    const { [name]: _removed, ...rest } = complete;
    expect(() => loadEnvironment(rest)).toThrow(new MissingEnvironmentVariableError(name));
  });
  test('rejects a short AUTH_SECRET', () => {
    expect(() => loadEnvironment({ ...complete, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
});
```
`connection.test.ts`
```ts
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { AUTH_DATABASE_FILE, DatabaseDirectoryNotWritableError, openDatabase } from './connection';
import { runMigrations } from './migrate';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'superdoc-history-'));
}

describe('openDatabase', () => {
  test('creates the auth tables after migrating', () => {
    const database = openDatabase({ directory: temporaryDirectory(), fileName: AUTH_DATABASE_FILE });
    runMigrations(database);
    const tables = database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(['account', 'session', 'user', 'verification']));
    database.sqlite.close();
  });
  test('migrating twice is idempotent', () => {
    const database = openDatabase({ directory: temporaryDirectory(), fileName: AUTH_DATABASE_FILE });
    runMigrations(database);
    expect(() => runMigrations(database)).not.toThrow();
    database.sqlite.close();
  });
  test('fails with a named error when the directory is not writable', () => {
    const directory = temporaryDirectory();
    chmodSync(directory, 0o500);
    expect(() => openDatabase({ directory, fileName: AUTH_DATABASE_FILE })).toThrow(DatabaseDirectoryNotWritableError);
  });
});
```

- [ ] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-history/server test:unit` → FAIL: modules not found.

- [ ] **Step 3: Implement configuration**

`environment.ts`
```ts
import { z } from 'zod';

const AUTH_SECRET_MIN_LENGTH = 32;

export class MissingEnvironmentVariableError extends Error {
  constructor(name: string) {
    super(`Missing environment variable: ${name}`);
  }
}

const schema = z.object({
  PORT: z.coerce.number().int().positive(),
  APP_ORIGIN: z.string().url(),
  AUTH_SECRET: z.string().min(AUTH_SECRET_MIN_LENGTH),
  DATABASE_DIR: z.string().min(1),
});

export type Environment = { port: number; appOrigin: string; authSecret: string; databaseDirectory: string };

export function loadEnvironment(source: NodeJS.ProcessEnv): Environment {
  const missing = Object.keys(schema.shape).find((name) => source[name] === undefined);
  if (missing) throw new MissingEnvironmentVariableError(missing);
  const parsed = schema.parse(source);
  return { port: parsed.PORT, appOrigin: parsed.APP_ORIGIN, authSecret: parsed.AUTH_SECRET, databaseDirectory: parsed.DATABASE_DIR };
}
```

- [ ] **Step 4: Generate the Better Auth schema for Drizzle, then the migration**

Create a minimal `apps/server/src/auth/auth.ts` placeholder is **not** allowed; instead run the CLI against a config file: `apps/server/better-auth.config.ts` exporting `betterAuth({ database: drizzleAdapter(drizzle(new Database(':memory:')), { provider: 'sqlite' }), emailAndPassword: { enabled: true } })`, then `pnpm --filter @superdoc-history/server exec better-auth generate --config better-auth.config.ts --output src/database/schema/auth.ts` (package `@better-auth/cli@1.4.21` as a devDependency). Commit the generated `schema/auth.ts` as is. `drizzle.config.ts`: `{ dialect: 'sqlite', schema: './src/database/schema/*.ts', out: './drizzle' }`. Run `pnpm --filter @superdoc-history/server exec drizzle-kit generate` and commit `drizzle/0000_*.sql` and `drizzle/meta/`.

- [ ] **Step 5: Implement connection and migrations**

`connection.ts`
```ts
import Database from 'better-sqlite3';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as authSchema from './schema/auth';

export const AUTH_DATABASE_FILE = 'auth.sqlite';

export class DatabaseDirectoryNotWritableError extends Error {
  constructor(directory: string) {
    super(`Database directory is not writable: ${directory}`);
  }
}

export type AuthDatabase = { sqlite: Database.Database; drizzle: BetterSQLite3Database<typeof authSchema> };

function ensureWritableDirectory(directory: string): void {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  try {
    accessSync(directory, constants.W_OK);
  } catch {
    throw new DatabaseDirectoryNotWritableError(directory);
  }
}

export function openDatabase({ directory, fileName }: { directory: string; fileName: string }): AuthDatabase {
  ensureWritableDirectory(directory);
  const sqlite = new Database(join(directory, fileName));
  sqlite.pragma('journal_mode = WAL');
  return { sqlite, drizzle: drizzle(sqlite, { schema: authSchema }) };
}
```
`migrate.ts`
```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import type { AuthDatabase } from './connection';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function runMigrations(database: AuthDatabase): void {
  migrate(database.drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
}
```
`apps/server/package.json`: name `@superdoc-history/server`, `"type": "module"`, scripts `dev: tsx watch src/main.ts`, `build: tsc -p tsconfig.build.json`, `start: node dist/main.js`, `typecheck: tsc --noEmit`, `test:unit: vitest run`, `seed: tsx src/seed.ts`; dependencies `hono 4.13.13`, `@hono/node-server 2.1.5`, `better-auth 1.7.10`, `drizzle-orm 0.45.4`, `better-sqlite3 13.0.3`, `@hocuspocus/server 2.15.3`, `yjs 13.6.33`, `ws 8.22.0`, `zod 4.6.7`, `@superdoc-history/types workspace:*`; devDependencies `drizzle-kit 0.31.11`, `@better-auth/cli 1.4.21`, `@types/better-sqlite3 9.6.0`, `@types/ws 8.18.2`, `@types/node`, `tsx 4.23.15`, `vitest 5.0.5`, `@hocuspocus/provider 2.15.3` (tests only).

- [ ] **Step 6: Run, expect pass** — 7 tests pass. `pnpm typecheck` clean.

- [ ] **Step 7: Commit** — `feat(server): add validated configuration and the auth database with migrations`

---

### Task 3: Better Auth and the HTTP app (G2)

**Files:**
- Create: `apps/server/src/auth/auth.ts`, `apps/server/src/auth/session.ts`, `apps/server/src/http/app.ts`, `apps/server/src/http/health.ts`, `apps/server/src/http/me.ts`
- Test: `apps/server/src/http/app.test.ts`, `apps/server/src/auth/session.test.ts`
- Test support: `apps/server/src/testing/test-server.ts`

**Interfaces:**
- Consumes: `loadEnvironment`, `openDatabase`, `runMigrations`, `signInSchema`, `signUpSchema`, `AUTH_ERROR_MESSAGE`, `ApiPath`.
- Produces: `createAuth({ database, environment }): Auth` (Better Auth instance); `readSession({ auth, headers }): Promise<SessionUser | null>` with `SessionUser = { id: string; name: string; email: string }`; `createApp({ auth }): Hono`; `startTestServer(): Promise<TestServer>` with `{ baseUrl, auth, database, stop() }` on port 0.

- [ ] **Step 1: Failing tests**

`app.test.ts` (real HTTP, `fetch`, cookie jar by hand)
```ts
import { ApiPath } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestServer, type TestServer } from '../testing/test-server';

let server: TestServer;
beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

const credentials = { name: 'Ana', email: 'ana@example.com', password: 'superdoc-demo' };

async function signUp(body: typeof credentials): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function signIn(body: { email: string; password: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function cookieOf(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('health', () => {
  test('answers ok', async () => {
    const response = await fetch(`${server.baseUrl}${ApiPath.Health}`);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('sign-up, sign-in and me', () => {
  test('a new user signs up, signs in and reads itself', async () => {
    expect((await signUp(credentials)).status).toBe(200);
    const signedIn = await signIn({ email: credentials.email, password: credentials.password });
    expect(signedIn.status).toBe(200);
    const me = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie: cookieOf(signedIn) } });
    expect(await me.json()).toEqual({ user: { id: expect.any(String), name: 'Ana', email: 'ana@example.com' } });
  });
  test('me without a session is 401', async () => {
    expect((await fetch(`${server.baseUrl}${ApiPath.Me}`)).status).toBe(401);
  });
  test('normalizes email case and whitespace', async () => {
    const response = await signIn({ email: '  ANA@example.com ', password: credentials.password });
    expect(response.status).toBe(200);
  });
  test('wrong password and unknown email return the same status and body', async () => {
    const wrongPassword = await signIn({ email: credentials.email, password: 'definitely-wrong' });
    const unknownEmail = await signIn({ email: 'nobody@example.com', password: 'definitely-wrong' });
    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(await wrongPassword.text()).toBe(await unknownEmail.text());
  });
  test('concurrent sign-ups with one email leave one user', async () => {
    const body = { name: 'Bruno', email: 'bruno@example.com', password: 'superdoc-demo' };
    await Promise.all([signUp(body), signUp(body), signUp(body)]);
    const count = server.database.sqlite.prepare('SELECT count(*) AS total FROM user WHERE email = ?').get(body.email) as { total: number };
    expect(count.total).toBe(1);
  });
  test('the fourth sign-in within ten seconds is rate limited', async () => {
    const attempts = await Promise.all(Array.from({ length: 4 }, () => signIn({ email: 'caio@example.com', password: 'definitely-wrong' })));
    expect(attempts.map((response) => response.status)).toContain(429);
    const limited = attempts.find((response) => response.status === 429)!;
    expect(limited.headers.get('x-retry-after')).toMatch(/^\d+$/);
  });
});
```
`session.test.ts`
```ts
import { describe, expect, test } from 'vitest';
import { readSession } from './session';
import { startTestServer } from '../testing/test-server';

describe('readSession', () => {
  test('returns null without a cookie', async () => {
    const server = await startTestServer();
    expect(await readSession({ auth: server.auth, headers: new Headers() })).toBeNull();
    await server.stop();
  });
  test('returns null for a garbage cookie', async () => {
    const server = await startTestServer();
    expect(await readSession({ auth: server.auth, headers: new Headers({ cookie: 'better-auth.session_token=garbage' }) })).toBeNull();
    await server.stop();
  });
});
```

- [ ] **Step 2: Run, expect failure** — modules not found.

- [ ] **Step 3: Implement**

`auth.ts`
```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Environment } from '../config/environment';
import type { AuthDatabase } from '../database/connection';
import * as authSchema from '../database/schema/auth';

const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_MAX_REQUESTS = 100;

export function createAuth({ database, environment }: { database: AuthDatabase; environment: Environment }) {
  return betterAuth({
    secret: environment.authSecret,
    baseURL: environment.appOrigin,
    trustedOrigins: [environment.appOrigin],
    database: drizzleAdapter(database.drizzle, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: true, window: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX_REQUESTS },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```
Better Auth lowercases emails on sign-up and sign-in by default and applies the built-in `/sign-in/email` rule of 3 requests per 10 seconds; if the "normalizes email" test fails, add a `hooks.before` that runs `signInSchema` on the body before Better Auth sees it. The unique index on `user.email` from the generated schema is what the concurrent sign-up test relies on; the duplicate requests get Better Auth's `USER_ALREADY_EXISTS` response.

`session.ts`
```ts
import type { Auth } from './auth';

export type SessionUser = { id: string; name: string; email: string };

export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}
```
`app.ts`
```ts
import { ApiPath } from '@superdoc-history/types';
import { Hono } from 'hono';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';

export function createApp({ auth }: { auth: Auth }): Hono {
  const app = new Hono();
  app.get(ApiPath.Health, (context) => context.json({ status: 'ok' }));
  app.on(['GET', 'POST'], `${ApiPath.Auth}/*`, (context) => auth.handler(context.req.raw));
  app.get(ApiPath.Me, async (context) => {
    const user = await readSession({ auth, headers: context.req.raw.headers });
    if (!user) return context.json({ error: 'Unauthorized' }, 401);
    return context.json({ user });
  });
  return app;
}
```
`testing/test-server.ts`
```ts
import { serve, type ServerType } from '@hono/node-server';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createAuth, type Auth } from '../auth/auth';
import { AUTH_DATABASE_FILE, openDatabase, type AuthDatabase } from '../database/connection';
import { runMigrations } from '../database/migrate';
import { createApp } from '../http/app';

export type TestServer = { baseUrl: string; auth: Auth; database: AuthDatabase; httpServer: ServerType; stop: () => Promise<void> };

export async function startTestServer(): Promise<TestServer> {
  const database = openDatabase({ directory: mkdtempSync(join(tmpdir(), 'superdoc-history-')), fileName: AUTH_DATABASE_FILE });
  runMigrations(database);
  const httpServer = await new Promise<ServerType>((resolve) => {
    const started = serve({ fetch: () => new Response(), port: 0 }, () => resolve(started));
  });
  const { port } = httpServer.address() as AddressInfo;
  const environment = { port, appOrigin: `http://127.0.0.1:${port}`, authSecret: 'test-secret-'.padEnd(32, 'x'), databaseDirectory: '' };
  const auth = createAuth({ database, environment });
  const app = createApp({ auth });
  httpServer.removeAllListeners('request');
  httpServer.on('request', serve({ fetch: app.fetch }).listeners('request')[0] as never);
  return { baseUrl: environment.appOrigin, auth, database, httpServer, stop: async () => { httpServer.close(); database.sqlite.close(); } };
}
```
If swapping the request listener proves awkward, start the server **after** creating `auth` with a port chosen by binding a throwaway `net` server first; the test contract (random port, same origin for `baseURL`) is what matters, not the trick.

- [ ] **Step 4: Run, expect pass** — 9 tests pass.

- [ ] **Step 5: Commit** — `feat(server): add Better Auth with rate limiting, health and me endpoints`

---

### Task 4: Server entry point and static web serving (G2)

**Files:**
- Create: `apps/server/src/server.ts`, `apps/server/src/main.ts`, `apps/server/src/http/static-web.ts`, `apps/server/tsconfig.build.json`
- Test: `apps/server/src/server.test.ts`

**Interfaces:**
- Produces: `startServer({ environment }): Promise<RunningServer>` with `{ httpServer, port, auth, database, stop() }`; `testEnvironment(): Environment` in `testing/test-server.ts` (port 0, temporary `DATABASE_DIR`, 32-character secret); `WEB_DIST_ENVIRONMENT_VARIABLE = 'WEB_DIST_DIR'` (optional; when set, the server serves that directory with SPA fallback to `index.html` for non-`/api` paths).

- [ ] **Step 1: Failing test**

```ts
test('serves the SPA fallback for an app route when WEB_DIST_DIR is set', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'web-dist-'));
  writeFileSync(join(dist, 'index.html'), '<html><body>app</body></html>');
  const running = await startServer({ environment: testEnvironment(), webDistDirectory: dist });
  const response = await fetch(`http://127.0.0.1:${running.port}/documents`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('app');
  await running.stop();
});
test('api 404 is json, not the SPA', async () => {
  const running = await startServer({ environment: testEnvironment(), webDistDirectory: null });
  const response = await fetch(`http://127.0.0.1:${running.port}/api/missing`);
  expect(response.status).toBe(404);
  expect(response.headers.get('content-type')).toContain('json');
  await running.stop();
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

`static-web.ts`: `serveStatic` from `@hono/node-server/serve-static` with `root: webDistDirectory`, then a final `app.get('*')` that returns `index.html` for paths not starting with `/api`; `app.notFound` returns `{ error: 'Not found' }` JSON for `/api/*`. `server.ts`:
```ts
export async function startServer({ environment, webDistDirectory }: { environment: Environment; webDistDirectory: string | null }): Promise<RunningServer> {
  const database = openDatabase({ directory: environment.databaseDirectory, fileName: AUTH_DATABASE_FILE });
  runMigrations(database);
  const auth = createAuth({ database, environment });
  const app = createApp({ auth });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  const httpServer = await listen({ app, port: environment.port });
  const port = (httpServer.address() as AddressInfo).port;
  return { httpServer, port, auth, database, stop: async () => { await closeServer(httpServer); database.sqlite.close(); } };
}
```
`main.ts`: `loadEnvironment(process.env)`, `webDistDirectory = process.env[WEB_DIST_ENVIRONMENT_VARIABLE] ?? null` is **not** allowed by the conventions; write `readOptionalWebDistDirectory(source)` that returns `string | null` explicitly with an `if`. Log one line `listening on :<port>`. Handle `SIGTERM` → `stop()`.

- [ ] **Step 4: Run, expect pass.** — [ ] **Step 5: Commit** — `feat(server): add the entry point with SPA serving`

---

### Task 5: Collaboration socket authenticated by the session cookie (G2)

**Files:**
- Create: `apps/server/src/collaboration/collaboration-server.ts`, `apps/server/src/collaboration/attach-collaboration.ts`
- Modify: `apps/server/src/server.ts` (call `attachCollaboration` after listen)
- Test: `apps/server/src/collaboration/collaboration-server.test.ts`

**Interfaces:**
- Consumes: `readSession`, `ApiPath.Collaboration`.
- Produces: `createCollaborationServer({ auth }): Hocuspocus` with `onAuthenticate` resolving `{ userId }` from the upgrade request's `cookie` header; `attachCollaboration({ httpServer, hocuspocus, path })` using a `ws` `WebSocketServer({ noServer: true })` and the HTTP `upgrade` event, calling `hocuspocus.handleConnection(socket, request)`. `CollaborationContext = { userId: string }`. Constant `COLLABORATION_TOKEN_PLACEHOLDER = 'session-cookie'` (Hocuspocus 2 runs `onAuthenticate` only when the client sends a non-empty token; the real credential is the cookie).

- [ ] **Step 1: Failing test** (provider from `@hocuspocus/provider` 2.15.3 in Node with a `ws` polyfill that injects the cookie)

```ts
import { HocuspocusProvider } from '@hocuspocus/provider';
import { ApiPath } from '@superdoc-history/types';
import WebSocket from 'ws';
import { describe, expect, test } from 'vitest';
import { COLLABORATION_TOKEN_PLACEHOLDER } from './collaboration-server';
import { signInAndGetCookie, startTestServer } from '../testing/test-server';

function socketWithCookie(cookie: string): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie } });
    }
  } as unknown as typeof WebSocket;
}

function connect({ url, cookie }: { url: string; cookie: string }): Promise<'authenticated' | 'failed'> {
  return new Promise((resolve) => {
    const provider = new HocuspocusProvider({
      url,
      name: 'probe',
      token: COLLABORATION_TOKEN_PLACEHOLDER,
      WebSocketPolyfill: socketWithCookie(cookie),
      onAuthenticated: () => { provider.destroy(); resolve('authenticated'); },
      onAuthenticationFailed: () => { provider.destroy(); resolve('failed'); },
    });
  });
}

describe('collaboration authentication', () => {
  test('accepts a valid session cookie', async () => {
    const server = await startTestServer();
    const cookie = await signInAndGetCookie({ server, credentials: { name: 'Ana', email: 'ana@example.com', password: 'superdoc-demo' } });
    expect(await connect({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, cookie })).toBe('authenticated');
    await server.stop();
  });
  test('rejects a missing cookie', async () => {
    const server = await startTestServer();
    expect(await connect({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, cookie: '' })).toBe('failed');
    await server.stop();
  });
  test('rejects an expired session cookie', async () => {
    const server = await startTestServer();
    const cookie = await signInAndGetCookie({ server, credentials: { name: 'Bruno', email: 'bruno@example.com', password: 'superdoc-demo' } });
    server.database.sqlite.prepare('DELETE FROM session').run();
    expect(await connect({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, cookie })).toBe('failed');
    await server.stop();
  });
});
```
Add `signInAndGetCookie({ server, credentials })` to `testing/test-server.ts` (sign-up then sign-in, return the cookie pair string). `startTestServer` now also attaches the collaboration server.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

`collaboration-server.ts`
```ts
import { Hocuspocus } from '@hocuspocus/server';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';

export const COLLABORATION_TOKEN_PLACEHOLDER = 'session-cookie';
export type CollaborationContext = { userId: string };

export class CollaborationAuthenticationError extends Error {
  constructor() {
    super('No valid session on the collaboration socket.');
  }
}

export function createCollaborationServer({ auth }: { auth: Auth }): Hocuspocus {
  return new Hocuspocus({
    quiet: true,
    async onAuthenticate({ requestHeaders }): Promise<CollaborationContext> {
      const cookie = requestHeaders.cookie;
      if (!cookie) throw new CollaborationAuthenticationError();
      const user = await readSession({ auth, headers: new Headers({ cookie }) });
      if (!user) throw new CollaborationAuthenticationError();
      return { userId: user.id };
    },
  });
}
```
`attach-collaboration.ts`
```ts
import type { Hocuspocus } from '@hocuspocus/server';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';

export function attachCollaboration({ httpServer, hocuspocus, path }: { httpServer: Server; hocuspocus: Hocuspocus; path: string }): void {
  const sockets = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://placeholder');
    if (url.pathname !== path) return socket.destroy();
    sockets.handleUpgrade(request, socket, head, (webSocket) => hocuspocus.handleConnection(webSocket, request));
  });
}
```
`request.url ?? '/'` is the one allowed boundary use: Node types it optional, and the URL is required for routing; keep it, the reviewer knows why. Hocuspocus 2.15.3 exposes `requestHeaders` as Node `IncomingHttpHeaders`; the `cookie` field is a string or undefined.

- [ ] **Step 4: Run, expect pass** (three tests). The "rejects a missing cookie" case must finish within the provider's first attempt; configure the test provider with `maxAttempts: 1` if it retries.

- [ ] **Step 5: Commit** — `feat(server): authenticate the collaboration socket with the session cookie`

---

### Task 6: Seed script (G2)

**Files:**
- Create: `apps/server/src/seed.ts`, `apps/server/src/auth/seed-demo-users.ts`
- Test: `apps/server/src/auth/seed-demo-users.test.ts`

**Interfaces:**
- Consumes: `DEMO_USERS`, `createAuth`.
- Produces: `seedDemoUsers({ auth, database, password }): Promise<SeedResult>` with `{ created: string[]; existing: string[] }`; `MissingDemoPasswordError`.

- [ ] **Step 1: Failing test**
```ts
test('creates the four demo users once and reports them as existing afterwards', async () => {
  const server = await startTestServer();
  const first = await seedDemoUsers({ auth: server.auth, database: server.database, password: 'superdoc-demo' });
  expect(first.created).toEqual(DEMO_USERS.map((user) => user.email));
  const second = await seedDemoUsers({ auth: server.auth, database: server.database, password: 'superdoc-demo' });
  expect(second).toEqual({ created: [], existing: DEMO_USERS.map((user) => user.email) });
  await server.stop();
});
test('a seeded user can sign in with the demo password', async () => {
  const server = await startTestServer();
  await seedDemoUsers({ auth: server.auth, database: server.database, password: 'superdoc-demo' });
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', password: 'superdoc-demo' }) });
  expect(response.status).toBe(200);
  await server.stop();
});
```
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement**: look up each email in `user` through Drizzle (`eq(authSchema.user.email, email)`); when absent call `auth.api.signUpEmail({ body: { name, email, password } })`. `seed.ts` loads the environment, reads `DEMO_PASSWORD` (throw `MissingDemoPasswordError` when absent), opens and migrates the database, runs the seed, prints the two lists and exits 0.
- [ ] **Step 4: Run, expect pass.** — [ ] **Step 5: Commit** — `feat(server): add the idempotent demo user seed`

---

### Task 7: Web app scaffold, design tokens and auth flow (G3)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/index.html`, `apps/web/components.json`
- Create: `apps/web/src/main.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/providers.tsx`, `apps/web/src/lib/query-client.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/styles/globals.css`
- Create: `apps/web/src/features/auth/auth-client.ts`, `apps/web/src/features/auth/use-session.ts`, `apps/web/src/features/auth/require-session.tsx`, `apps/web/src/features/auth/safe-next-path.ts`, `apps/web/src/features/auth/sign-in-page.tsx`, `apps/web/src/features/auth/sign-up-page.tsx`, `apps/web/src/features/auth/sign-out-button.tsx`
- Create: `apps/web/src/routes/documents-page.tsx`, `apps/web/src/components/ui/{button,input,label,card,form,sonner}.tsx` (via `pnpm dlx shadcn@4.21.5 add …`)
- Test: `apps/web/src/features/auth/safe-next-path.test.ts`, `apps/web/src/features/auth/sign-in-page.test.tsx`

**Interfaces:**
- Consumes: `AppRoute`, `ApiPath`, `signInSchema`, `signUpSchema`, `AUTH_ERROR_MESSAGE`.
- Produces: `useSession(): { user: SessionUser | null; isLoading: boolean }` (query key `['me']`); `RequireSession` route wrapper; `safeNextPath(raw: string | null): string`; `authClient` from `better-auth/react` `createAuthClient({ baseURL: window.location.origin })`.

- [ ] **Step 1: Scaffold** — `pnpm create vite apps/web --template react-ts` adjusted to the base tsconfig; add `@tailwindcss/vite`, `tailwindcss 4.3.3`, `react-router 8.4.0`, `@tanstack/react-query 5.104.3`, `react-hook-form 7.90.0`, `@hookform/resolvers 5.9.1`, `better-auth 1.7.10` (client), `@superdoc-history/types workspace:*`; devDependencies `vitest 5.0.5`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`. `vite.config.ts` proxies `/api` and `/collaboration` (with `ws: true`) to `http://localhost:3000`. `components.json` for shadcn with `tailwind.css: src/styles/globals.css`, style `new-york`, base colour `neutral`.

- [ ] **Step 2: Design tokens (ADR 0009)** in `globals.css`: shadcn's default neutral token set with the accent (`--primary`) set to a blue close to the SuperDoc editor's, `font-family: Inter, system-ui, sans-serif` loaded from a self-hosted `@fontsource-variable/inter` (no Google Fonts CDN: no third-party services), `.dark` block present with the inverted neutrals. No component sets a raw colour.

- [ ] **Step 3: Failing tests**

`safe-next-path.test.ts`
```ts
test.each([
  ['/documents', '/documents'],
  ['/documents?x=1', '/documents?x=1'],
  [null, '/documents'],
  ['//evil.example', '/documents'],
  ['https://evil.example/x', '/documents'],
  ['documents', '/documents'],
])('ignores an absolute next parameter: %s → %s', (raw, expected) => expect(safeNextPath(raw)).toBe(expected));
```
`sign-in-page.test.tsx`: renders `SignInPage` inside a `MemoryRouter` and `QueryClientProvider`; typing an invalid email and submitting shows the zod message; submitting valid credentials calls a mocked `authClient.signIn.email` once with the trimmed lowercase email; a 401 response shows `AUTH_ERROR_MESSAGE` and nothing more specific.

- [ ] **Step 4: Run, expect failure.**

- [ ] **Step 5: Implement**

`safe-next-path.ts`
```ts
import { AppRoute } from '@superdoc-history/types';

export function safeNextPath(raw: string | null): string {
  if (!raw) return AppRoute.Documents;
  const isRelativePath = raw.startsWith('/') && !raw.startsWith('//');
  if (!isRelativePath) return AppRoute.Documents;
  return raw;
}
```
`use-session.ts`: `useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })` where `fetchMe` returns `null` on 401 and the user on 200. `require-session.tsx`: renders children when `user`, a skeleton while loading, `<Navigate to={AppRoute.SignIn + '?next=' + encodeURIComponent(location.pathname + location.search)} replace />` otherwise. `sign-in-page.tsx` and `sign-up-page.tsx`: `react-hook-form` + `zodResolver(signInSchema)`; on success `queryClient.invalidateQueries({ queryKey: ['me'] })` then `navigate(safeNextPath(searchParams.get('next')))`; on 401 set a form-level error `AUTH_ERROR_MESSAGE`; on 429 show `Too many attempts. Try again in ${retryAfter} seconds.` from the `X-Retry-After` header. `sign-out-button.tsx`: `authClient.signOut()` then invalidate `['me']` and navigate to `AppRoute.SignIn`. `documents-page.tsx`: header with the user's name and the sign-out button, an empty state card "No documents yet" (slice 2 fills it). `router.tsx`: `createBrowserRouter` with `/` → redirect to `AppRoute.Documents`, the two auth routes, and `AppRoute.Documents` wrapped in `RequireSession`.

- [ ] **Step 6: Run, expect pass** — unit tests green; `pnpm --filter @superdoc-history/web build` produces `dist/`.

- [ ] **Step 7: Commit** — `feat(web): add the app shell, design tokens and the sign-in flow`

---

### Task 8: Narrow-width and empty-state polish (G3)

**Files:**
- Modify: `apps/web/src/features/auth/sign-in-page.tsx`, `sign-up-page.tsx`, `apps/web/src/routes/documents-page.tsx`

- [ ] **Step 1:** Forms centred in a `max-w-sm` card on desktop, full width with 16 px gutters under 640 px; focus rings visible; the submit button shows a pending state and is disabled while the request is in flight; `Enter` submits.
- [ ] **Step 2:** Verify with `pnpm --filter @superdoc-history/web dev` at 1280 px and 375 px (developer visual check; the tester proves it with Playwright MCP).
- [ ] **Step 3: Commit** — `feat(web): make the auth screens responsive`

---

### Task 9: End-to-end specs (G4)

**Files:**
- Create: `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: the built web served by the server (`WEB_DIST_DIR=apps/web/dist`), `pnpm seed`.
- Produces: `webServer` config that builds web, starts the server on 3100 with a temporary `DATABASE_DIR`, seeds, and waits for `/api/health`; fixtures `signedInPage(user)`.

- [ ] **Step 1: Specs**
```ts
test('a new user signs up and lands on documents', async ({ page }) => { /* visit /sign-up, fill, submit, expect heading "No documents yet" and the name in the header */ });
test('wrong password shows one generic message', async ({ page }) => { /* expect text AUTH_ERROR_MESSAGE, and no "user not found" anywhere */ });
test('visiting documents signed out redirects to sign-in and returns after login', async ({ page }) => { /* goto /documents → url has /sign-in?next=%2Fdocuments → sign in → url is /documents */ });
test('sign out returns to sign-in and documents is protected again', async ({ page }) => {});
test('two users in two contexts see their own names', async ({ browser }) => { /* two contexts, ana and bruno, both headers correct */ });
test('the fourth failed attempt shows the retry message', async ({ page }) => {});
test('narrow viewport keeps the form usable', async ({ page }) => { /* viewport 375×812, no horizontal scroll, submit visible */ });
```
- [ ] **Step 2: Run** — `pnpm test:e2e` → 7 passed. Keep each spec independent: unique emails per test, seeded users only read.
- [ ] **Step 3: Commit** — `test(e2e): cover sign-up, sign-in, protection, sign-out and two users`

---

### Task 10: Docker image and Compose (G4)

**Files:**
- Create: `docker/Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`, `.dockerignore`

- [ ] **Step 1: Dockerfile** — stage `build`: `node:24-bookworm-slim`, corepack pnpm 8.15.9, `pnpm install --frozen-lockfile`, `pnpm build` (web then server); stage `runtime`: same base, copy `apps/server/dist`, `apps/server/drizzle`, `apps/web/dist`, production `node_modules` (`pnpm deploy --prod --filter @superdoc-history/server /app`), `WEB_DIST_DIR=/app/web`, `DATABASE_DIR=/data`, `USER node`, `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1))"`. better-sqlite3's prebuilt binary matches `node:24` on linux x64 and arm64; the build stage runs `pnpm rebuild better-sqlite3` only when the prebuilt download fails.
- [ ] **Step 2: entrypoint.sh** — runs the seed when `SEED_DEMO_USERS=true`, then `node dist/main.js`.
- [ ] **Step 3: docker-compose.yml** — one service `app`, `ports: ["3000:3000"]`, `env_file: .env`, volume `history-data:/data`, `healthcheck` mirroring the Dockerfile.
- [ ] **Step 4: Verify** — `docker compose up --build -d`, `curl -f localhost:3000/api/health`, `curl -s localhost:3000/sign-in | grep -q '<div id="root">'`, `docker compose down`.
- [ ] **Step 5: Commit** — `chore(docker): add the single-image build and compose`

---

### Task 11: CI, README and tester briefing (G4)

**Files:**
- Create: `.github/workflows/verify.yml`, `README.md`
- Create: `docs/features/bootstrap-and-auth/tester-briefing.md`
- Modify: `docs/features/README.md` (status → Building)

- [ ] **Step 1: verify.yml** — on `pull_request` and `push` to `main`: checkout, `pnpm/action-setup@v4`, `actions/setup-node@v4` with `node-version-file: .nvmrc` and pnpm cache, `pnpm install --frozen-lockfile`, `pnpm exec playwright install --with-deps chromium`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e`, upload `playwright-report` on failure.
- [ ] **Step 2: README.md** — what the project is, how to run (`cp .env.example .env`, `pnpm install`, `pnpm seed`, `pnpm dev`; Docker path), the demo users, the test commands, a "Process" section linking `AGENTS.md`, `.claude/HARNESS.md`, `docs/adr`, `docs/features`, and the mandatory citation section: LLM use (this codebase is developed with Claude Code and the harness in this repo), starter code (shadcn/ui components copied under `apps/web/src/components/ui`, superpowers skills vendored under `.agents/skills`).
- [ ] **Step 3: Tester briefing** — per `docs/features/_template/tester-briefing.md`: how to run, the seven E2E specs and unit suites as red-today/green-after, hypotheses ("the fourth attempt is rate limited", "the socket rejects an expired session", "narrow width has no horizontal scroll"), known gaps (no password reset, no dark-mode switch in the UI).
- [ ] **Step 4: Commit** — `ci: run the verify gate on pull requests` and `docs: add the README and tester briefing`

---

### Z. Prove and ship

- [ ] **Z1:** Developer A hands over `tester-briefing.md`; the orchestrator dispatches the `tester` sub-agent with `test-plan.md` only.
- [ ] **Z2:** Tester executes `test-plan.md`, ticks with evidence, files defects; defects go back to the owning group.
- [ ] **Z3:** `reviewer` sub-agent on `git diff main...HEAD`; findings fixed; verdict recorded in the PR body.
- [ ] **Z4:** `/check-ui http://localhost:3100/sign-in bootstrap-and-auth --video` by the `recorder`; assets on the `pr-media-bootstrap-and-auth` pre-release.
- [ ] **Z5:** Learnings sweep; ADR check (0004 addendum already recorded); `/open-pr bootstrap-and-auth`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|---|---|---|---|
| 2.4 | Better Auth CLI output does not match drizzle-kit expectations | `drizzle-kit generate` reports no tables or the migration test lists fewer than four tables | Write `schema/auth.ts` by hand from Better Auth's core schema (user, session, account, verification) and regenerate |
| 3.3 | Email normalization differs between the web schema and Better Auth | `normalizes email case and whitespace` fails with 401 | Add the `hooks.before` that applies `signInSchema` before Better Auth |
| 3.3 | Rate limit test flaky because the default sign-in rule counts per IP and Vitest reuses the process | 429 appears in an unrelated test | Isolate: one `startTestServer` per describe; sign-in attempts use distinct emails but the same IP, so the rule applies as intended |
| 5.3 | Hocuspocus 2.15.3 does not expose the cookie in `requestHeaders` | `accepts a valid session cookie` fails with `failed` while the HTTP test passes | Read `request.headers.cookie` from the second `handleConnection` argument instead; both are available in 2.15.3 |
| 5.3 | Provider polyfill ignores extra `ws` options | Server logs no cookie; test fails | Pass the cookie as a query parameter **only in tests** is not acceptable (would leak into logs); instead subclass `ws` as shown and assert the header arrives in a tiny upgrade-listener test |
| 7.1 | shadcn 4 CLI expects Tailwind 4 setup it cannot find | `shadcn add` errors on `components.json` | Copy the six component files from the shadcn registry by hand; they are plain TSX |
| 9.1 | Playwright `webServer` starts before the seed finishes | First spec fails with 401 on seeded users | `webServer.command` is a single shell line `pnpm seed && node …`; `url` waits for `/api/health` |
| 10.1 | better-sqlite3 prebuilt binary missing for the image platform | Docker build fails in `node-gyp` | Add `python3 make g++` to the build stage only; runtime stage stays slim |
| 11.1 | Playwright browsers in CI exceed time | Job > 10 min | Cache `~/.cache/ms-playwright` keyed by the Playwright version |

**Steps with no backout:** none; every step is additive on a feature branch.
