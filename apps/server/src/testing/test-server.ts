import {
  ApiPath,
  DEMO_ADMIN,
  INVITE_TOKEN_HEADER,
  OPEN_UNCOMMITTED_PER_MINUTE,
  UTC_TIME_ZONE,
  type SessionUser,
  inviteTokenOf,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import type { Auth } from '../auth/auth';
import type { Environment, LlmSettings } from '../config/environment';
import type { AuthDatabase } from '../database/connection';
import { DEFAULT_VERSION_ROOM_POLICY, type VersionRoomPolicy } from '../collaboration/version-rooms';
import { LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS } from '../config/environment';
import { chooseLanguageModel, type LanguageModelChoice } from '../insights/llm-client';
import { startServer, type RunningServer, type ServerServices } from '../server';
import { PROJECTION_WORKER_FILE_VARIABLE } from './projection-worker-variable';
import { temporaryDirectory } from './temporary-directory';

export const TEST_AUTH_SECRET = 'test-secret-'.padEnd(32, 'x');
export const LOOPBACK_HOST = '127.0.0.1';
const UNIQUE_EMAIL_SUFFIX_LENGTH = 8;
const NO_LLM_SETTINGS: LlmSettings = {
  model: null,
  apiKey: null,
  baseUrl: null,
  maxConcurrentJobs: LLM_MAX_CONCURRENT_JOBS,
  maxCallsPerHour: LLM_MAX_CALLS_PER_HOUR,
};
const OWNER_NAME = 'Ana';
export const TEST_USER_PASSWORD = 'superdoc-demo';
export const TEST_TIME_ZONE = UTC_TIME_ZONE;

export type TestUser = { id: string; email: string; cookie: string };

export type TestServer = {
  baseUrl: string;
  auth: Auth;
  database: AuthDatabase;
  services: ServerServices;
  databaseDirectory: string;
  hasAdmin: boolean;
  admin: TestUser;
  stop: () => Promise<void>;
};

async function reserveFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, LOOPBACK_HOST, resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

export function testEnvironment({ databaseDirectory = temporaryDirectory() }: { databaseDirectory?: string } = {}): Environment {
  return {
    port: 0,
    host: LOOPBACK_HOST,
    appOrigin: `http://${LOOPBACK_HOST}`,
    authSecret: TEST_AUTH_SECRET,
    databaseDirectory,
    trustProxy: true,
    llm: NO_LLM_SETTINGS,
    openUncommittedPerMinute: OPEN_UNCOMMITTED_PER_MINUTE,
  };
}

export function prebuiltProjectionWorkerFile(): URL | null {
  const value = process.env[PROJECTION_WORKER_FILE_VARIABLE];
  if (!value) return null;
  return new URL(value);
}

const ADDRESS_IN_USE_CODE = 'EADDRINUSE';
const START_ATTEMPTS = 5;

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === ADDRESS_IN_USE_CODE;
}

export async function startTestServer({
  trustProxy = true,
  databaseDirectory = temporaryDirectory(),
  languageModel = chooseLanguageModel(NO_LLM_SETTINGS),
  versionRoomPolicy = DEFAULT_VERSION_ROOM_POLICY,
  attemptsLeft = START_ATTEMPTS,
  claim = true,
  now = Date.now,
}: {
  trustProxy?: boolean;
  databaseDirectory?: string;
  languageModel?: LanguageModelChoice;
  versionRoomPolicy?: VersionRoomPolicy;
  attemptsLeft?: number;
  claim?: boolean;
  now?: () => number;
} = {}): Promise<TestServer> {
  const port = await reserveFreePort();
  const environment: Environment = {
    port,
    host: LOOPBACK_HOST,
    appOrigin: `http://${LOOPBACK_HOST}:${port}`,
    authSecret: TEST_AUTH_SECRET,
    databaseDirectory,
    trustProxy,
    llm: NO_LLM_SETTINGS,
    openUncommittedPerMinute: OPEN_UNCOMMITTED_PER_MINUTE,
  };
  try {
    const running = await startServer({
      environment,
      webDistDirectory: null,
      languageModel,
      versionRoomPolicy,
      projectionWorkerFile: prebuiltProjectionWorkerFile(),
      now,
    });
    const unclaimed = buildTestServer({ running, databaseDirectory, admin: null });
    if (!claim) return unclaimed;
    return buildTestServer({ running, databaseDirectory, admin: await claimOrSignInAdmin(unclaimed) });
  } catch (error) {
    if (!isAddressInUse(error) || attemptsLeft <= 1) throw error;
    return startTestServer({ trustProxy, databaseDirectory, languageModel, versionRoomPolicy, attemptsLeft: attemptsLeft - 1, claim, now });
  }
}

class NoTestAdminError extends Error {
  constructor() {
    super('startTestServer({ claim: false }) has no admin.');
  }
}

function buildTestServer({
  running,
  databaseDirectory,
  admin,
}: {
  running: RunningServer;
  databaseDirectory: string;
  admin: TestUser | null;
}): TestServer {
  return {
    baseUrl: `http://${LOOPBACK_HOST}:${running.port}`,
    auth: running.auth,
    database: running.database,
    services: running.services,
    databaseDirectory,
    hasAdmin: admin !== null,
    get admin(): TestUser {
      if (!admin) throw new NoTestAdminError();
      return admin;
    },
    stop: running.stop,
  };
}

function inviteHeaders(server: TestServer): Record<string, string> {
  if (!server.hasAdmin) return {};
  return { [INVITE_TOKEN_HEADER]: inviteTokenOf(server.services.invites.create({ createdBy: server.admin.id }).url) };
}

let nextClientAddress = 0;

async function postCredentials({
  server,
  path,
  body,
  headers = {},
}: {
  server: TestServer;
  path: string;
  body: Record<string, string>;
  headers?: Record<string, string>;
}): Promise<Response> {
  const clientAddress = `10.200.0.${nextClientAddress++}`;
  return fetch(`${server.baseUrl}${ApiPath.Auth}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': clientAddress, origin: server.baseUrl, ...headers },
    body: JSON.stringify(body),
  });
}

class TestSignInFailedError extends Error {
  constructor({ step, status }: { step: string; status: number }) {
    super(`Test sign-in failed at ${step} with status ${status}.`);
  }
}

export async function signInExisting({
  server,
  email,
  password,
}: {
  server: TestServer;
  email: string;
  password: string;
}): Promise<string> {
  const signedIn = await postCredentials({ server, path: '/sign-in/email', body: { email, password } });
  if (!signedIn.ok) throw new TestSignInFailedError({ step: 'sign-in', status: signedIn.status });
  const cookie = signedIn.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(';')[0])
    .join('; ');
  if (!cookie) throw new TestSignInFailedError({ step: 'cookie', status: signedIn.status });
  return cookie;
}

export async function signInAndGetCookie({
  server,
  credentials,
}: {
  server: TestServer;
  credentials: { name: string; email: string; password: string };
}): Promise<string> {
  const signedUp = await postCredentials({
    server,
    path: '/sign-up/email',
    body: { ...credentials, timeZone: TEST_TIME_ZONE },
    headers: inviteHeaders(server),
  });
  if (!signedUp.ok) throw new TestSignInFailedError({ step: 'sign-up', status: signedUp.status });
  return signInExisting({ server, email: credentials.email, password: credentials.password });
}

async function claimOrSignInAdmin(server: TestServer): Promise<TestUser> {
  const credentials = { ...DEMO_ADMIN, password: TEST_USER_PASSWORD };
  if (!server.services.invites.hasAnyUser()) {
    const signedUp = await postCredentials({ server, path: '/sign-up/email', body: { ...credentials, timeZone: TEST_TIME_ZONE } });
    if (!signedUp.ok) throw new TestSignInFailedError({ step: 'claim', status: signedUp.status });
  }
  const cookie = await signInExisting({ server, email: credentials.email, password: credentials.password });
  return { id: await currentUserId({ server, cookie }), email: credentials.email, cookie };
}

export async function currentUserId({ server, cookie }: { server: TestServer; cookie: string }): Promise<string> {
  const response = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } });
  const { user } = (await response.json()) as { user: SessionUser | null };
  if (!user) throw new TestSignInFailedError({ step: 'me', status: response.status });
  return user.id;
}

export async function signedInUser({ server, name }: { server: TestServer; name: string }): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, UNIQUE_EMAIL_SUFFIX_LENGTH)}@example.com`;
  const cookie = await signInAndGetCookie({ server, credentials: { name, email, password: TEST_USER_PASSWORD } });
  return { id: await currentUserId({ server, cookie }), email, cookie };
}

export async function signedInOwner({
  languageModel,
  versionRoomPolicy,
}: { languageModel?: LanguageModelChoice; versionRoomPolicy?: VersionRoomPolicy } = {}): Promise<{ server: TestServer; owner: TestUser }> {
  const server = await startTestServer({ languageModel, versionRoomPolicy });
  return { server, owner: await signedInUser({ server, name: OWNER_NAME }) };
}
