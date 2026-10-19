import {
  ACCOUNT_ARCHIVED_MESSAGE,
  ApiPath,
  CANNOT_ARCHIVE_SELF_MESSAGE,
  CANNOT_IMPERSONATE_ADMIN_MESSAGE,
  CANNOT_IMPERSONATE_ARCHIVED_MESSAGE,
  CANNOT_IMPERSONATE_SELF_MESSAGE,
  HttpMethod,
  HttpStatus,
  IMPERSONATION_SESSION_MS,
  LAST_ADMIN_MESSAGE,
  STOP_IMPERSONATING_API_PATH,
  UserAction,
  UserRole,
  userActionApiPath,
  type AdminUser,
  type SessionUser,
} from '@superdoc-collab/types';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from '../database/schema/auth';
import { signedInUser, signInExisting, startTestServer, TEST_USER_PASSWORD, type TestServer } from '../testing/test-server';

const SESSION_COOKIE_PATTERN = /session_token/;

function USERS_ROLE_PATH(id: string): string {
  return `${ApiPath.Admin}/users/${id}/role`;
}

function act({
  server,
  userId,
  action,
  cookie,
}: {
  server: TestServer;
  userId: string;
  action: UserAction;
  cookie?: string;
}): Promise<Response> {
  const headers: Record<string, string> = { origin: server.baseUrl };
  if (cookie) headers.cookie = cookie;
  return fetch(`${server.baseUrl}${userActionApiPath({ userId, action })}`, { method: HttpMethod.Post, headers });
}

function signInRequest({ server, email, cookie }: { server: TestServer; email: string; cookie?: string }): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: server.baseUrl };
  if (cookie) headers.cookie = cookie;
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-in/email`, {
    method: HttpMethod.Post,
    headers,
    body: JSON.stringify({ email, password: TEST_USER_PASSWORD }),
  });
}

async function meOf({ server, cookie }: { server: TestServer; cookie: string }): Promise<SessionUser | null> {
  const response = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } });
  return ((await response.json()) as { user: SessionUser | null }).user;
}

function cookieAfter({ response, previous }: { response: Response; previous: string }): string {
  const cookies = new Map(previous.split('; ').map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]));
  response.headers.getSetCookie().forEach((setCookie) => {
    const [pair] = setCookie.split(';');
    cookies.set(pair!.slice(0, pair!.indexOf('=')), pair!.slice(pair!.indexOf('=') + 1));
  });
  return [...cookies]
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function makeAdmin({ server, userId }: { server: TestServer; userId: string }): void {
  server.database.sqlite.prepare('update user set role = ? where id = ?').run(UserRole.Admin, userId);
}

async function listedUser({ server, id }: { server: TestServer; id: string }): Promise<AdminUser | undefined> {
  const response = await fetch(`${server.baseUrl}${ApiPath.Admin}/users`, { headers: { cookie: server.admin.cookie } });
  return ((await response.json()) as AdminUser[]).find((user) => user.id === id);
}

afterEach(() => vi.restoreAllMocks());

describe('archive and restore', () => {
  test('archiving bans the user, ends their sessions, closes their sockets and revokes only their grants', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    const closeSockets = vi.spyOn(server.services.runtime, 'closeConnectionsOfUser').mockImplementation(() => undefined);
    const { drizzle } = server.database;
    drizzle.insert(oauthClient).values({ id: 'client-row', clientId: 'agent-client', redirectUris: [] }).run();
    [eve.id, server.admin.id].forEach((userId) => {
      const scopes = ['read'];
      drizzle
        .insert(oauthConsent)
        .values({ id: `consent-${userId}`, clientId: 'agent-client', userId, scopes })
        .run();
      drizzle
        .insert(oauthRefreshToken)
        .values({ id: `refresh-${userId}`, token: `refresh-${userId}`, clientId: 'agent-client', userId, scopes })
        .run();
      drizzle
        .insert(oauthAccessToken)
        .values({ id: `access-${userId}`, token: `access-${userId}`, clientId: 'agent-client', userId, scopes })
        .run();
    });
    const response = await act({ server, userId: eve.id, action: UserAction.Archive, cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.Ok);
    expect(await response.json()).toMatchObject({ id: eve.id, isArchived: true });
    expect(await meOf({ server, cookie: eve.cookie })).toBeNull();
    expect(closeSockets).toHaveBeenCalledWith(eve.id);
    const owners = [oauthConsent, oauthRefreshToken, oauthAccessToken].map((table) =>
      drizzle
        .select({ userId: table.userId })
        .from(table)
        .all()
        .map((row) => row.userId),
    );
    expect(owners).toEqual([[server.admin.id], [server.admin.id], [server.admin.id]]);
    await server.stop();
  });

  test('an archived user is listed as archived and signing in answers the archived message', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    await act({ server, userId: eve.id, action: UserAction.Archive, cookie: server.admin.cookie });
    expect((await listedUser({ server, id: eve.id }))?.isArchived).toBe(true);
    const response = await signInRequest({ server, email: eve.email });
    expect(response.status).toBe(HttpStatus.Forbidden);
    expect(await response.json()).toMatchObject({ message: ACCOUNT_ARCHIVED_MESSAGE });
    await server.stop();
  });

  test('restoring lets the user sign in again', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    await act({ server, userId: eve.id, action: UserAction.Archive, cookie: server.admin.cookie });
    const response = await act({ server, userId: eve.id, action: UserAction.Restore, cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.Ok);
    expect(await response.json()).toMatchObject({ id: eve.id, isArchived: false });
    await expect(signInExisting({ server, email: eve.email, password: TEST_USER_PASSWORD })).resolves.toContain('=');
    await server.stop();
  });

  test('the last active admin cannot be archived', async () => {
    const server = await startTestServer();
    const response = await act({ server, userId: server.admin.id, action: UserAction.Archive, cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.Conflict);
    expect(await response.json()).toEqual({ error: LAST_ADMIN_MESSAGE });
    await server.stop();
  });

  test('an admin cannot archive themself while another admin exists', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    makeAdmin({ server, userId: eve.id });
    const response = await act({ server, userId: server.admin.id, action: UserAction.Archive, cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.BadRequest);
    expect(await response.json()).toEqual({ error: CANNOT_ARCHIVE_SELF_MESSAGE });
    await server.stop();
  });

  test('archiving or restoring an unknown user answers 404', async () => {
    const server = await startTestServer();
    const statuses = await Promise.all(
      [UserAction.Archive, UserAction.Restore].map(
        async (action) => (await act({ server, userId: 'nope', action, cookie: server.admin.cookie })).status,
      ),
    );
    expect(statuses).toEqual([HttpStatus.NotFound, HttpStatus.NotFound]);
    await server.stop();
  });

  test.each([UserAction.Archive, UserAction.Restore, UserAction.Impersonate])('%s is 401 signed out and 403 for a user', async (action) => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    expect((await act({ server, userId: eve.id, action })).status).toBe(HttpStatus.Unauthorized);
    expect((await act({ server, userId: eve.id, action, cookie: eve.cookie })).status).toBe(HttpStatus.Forbidden);
    await server.stop();
  });
});

describe('impersonate and stop', () => {
  async function impersonating({ server }: { server: TestServer }) {
    const eve = await signedInUser({ server, name: 'Eve' });
    const response = await act({ server, userId: eve.id, action: UserAction.Impersonate, cookie: server.admin.cookie });
    return { eve, response, cookie: cookieAfter({ response, previous: server.admin.cookie }) };
  }

  test('the cookie reads as the target with the admin as impersonator and one log line with ids only', async () => {
    const server = await startTestServer();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { eve, response, cookie } = await impersonating({ server });
    expect(response.status).toBe(HttpStatus.NoContent);
    expect(response.headers.getSetCookie().join(' ')).toMatch(SESSION_COOKIE_PATTERN);
    expect(await meOf({ server, cookie })).toMatchObject({ id: eve.id, impersonatedBy: server.admin.id });
    expect(info.mock.calls).toEqual([[`impersonation started by ${server.admin.id} as ${eve.id}`]]);
    await server.stop();
  });

  test('stopping returns the admin session', async () => {
    const server = await startTestServer();
    const { cookie } = await impersonating({ server });
    const stopped = await fetch(`${server.baseUrl}${STOP_IMPERSONATING_API_PATH}`, {
      method: HttpMethod.Post,
      headers: { cookie, origin: server.baseUrl, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(stopped.status).toBe(HttpStatus.Ok);
    const adminCookie = cookieAfter({ response: stopped, previous: cookie });
    expect(await meOf({ server, cookie: adminCookie })).toMatchObject({ id: server.admin.id, role: UserRole.Admin });
    await server.stop();
  });

  test('a stop without a JSON content type answers 415 and keeps the impersonation', async () => {
    const server = await startTestServer();
    const { eve, cookie } = await impersonating({ server });
    const stopped = await fetch(`${server.baseUrl}${STOP_IMPERSONATING_API_PATH}`, {
      method: HttpMethod.Post,
      headers: { cookie, origin: server.baseUrl },
    });
    expect(stopped.status).toBe(HttpStatus.UnsupportedMediaType);
    expect(await meOf({ server, cookie })).toMatchObject({ id: eve.id });
    await server.stop();
  });

  test.each([
    { name: 'yourself', message: CANNOT_IMPERSONATE_SELF_MESSAGE, prepare: async (server: TestServer) => server.admin.id },
    {
      name: 'an archived user',
      message: CANNOT_IMPERSONATE_ARCHIVED_MESSAGE,
      prepare: async (server: TestServer) => {
        const eve = await signedInUser({ server, name: 'Eve' });
        await act({ server, userId: eve.id, action: UserAction.Archive, cookie: server.admin.cookie });
        return eve.id;
      },
    },
    {
      name: 'an admin',
      message: CANNOT_IMPERSONATE_ADMIN_MESSAGE,
      prepare: async (server: TestServer) => {
        const eve = await signedInUser({ server, name: 'Eve' });
        makeAdmin({ server, userId: eve.id });
        return eve.id;
      },
    },
  ])('impersonating $name answers 400 and starts no session', async ({ message, prepare }) => {
    const server = await startTestServer();
    const userId = await prepare(server);
    const response = await act({ server, userId, action: UserAction.Impersonate, cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.BadRequest);
    expect(await response.json()).toEqual({ error: message });
    expect(response.headers.getSetCookie()).toEqual([]);
    await server.stop();
  });

  test('impersonating an unknown user answers 404', async () => {
    const server = await startTestServer();
    const response = await act({ server, userId: 'nope', action: UserAction.Impersonate, cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.NotFound);
    await server.stop();
  });
});

describe('impersonation sessions follow the impersonator', () => {
  async function adminImpersonating({ server }: { server: TestServer }) {
    const eve = await signedInUser({ server, name: 'Eve' });
    makeAdmin({ server, userId: eve.id });
    const caio = await signedInUser({ server, name: 'Caio' });
    const response = await act({ server, userId: caio.id, action: UserAction.Impersonate, cookie: eve.cookie });
    return { eve, caio, cookie: cookieAfter({ response, previous: eve.cookie }) };
  }

  test('archiving the impersonating admin ends the session they opened and closes its sockets', async () => {
    const server = await startTestServer();
    const { eve, caio, cookie } = await adminImpersonating({ server });
    expect(await meOf({ server, cookie })).toMatchObject({ id: caio.id, impersonatedBy: eve.id });
    const closeSockets = vi.spyOn(server.services.runtime, 'closeConnectionsOfUser').mockImplementation(() => undefined);
    await act({ server, userId: eve.id, action: UserAction.Archive, cookie: server.admin.cookie });
    expect(await meOf({ server, cookie })).toBeNull();
    expect(closeSockets).toHaveBeenCalledWith(caio.id);
    await server.stop();
  });

  test('demoting the impersonating admin makes the session they opened read as signed out', async () => {
    const server = await startTestServer();
    const { eve, cookie } = await adminImpersonating({ server });
    server.database.sqlite.prepare('update user set role = ? where id = ?').run(UserRole.User, eve.id);
    expect(await meOf({ server, cookie })).toBeNull();
    await server.stop();
  });

  test('an impersonation session older than the impersonation hour reads as signed out', async () => {
    const server = await startTestServer();
    const { cookie } = await adminImpersonating({ server });
    server.database.sqlite
      .prepare('update session set created_at = ? where impersonated_by is not null')
      .run(Date.now() - 2 * IMPERSONATION_SESSION_MS);
    expect(await meOf({ server, cookie })).toBeNull();
    await server.stop();
  });

  test('a two-hour-old impersonation session answers 401 on get-session and its row is gone', async () => {
    const server = await startTestServer();
    const { cookie } = await adminImpersonating({ server });
    server.database.sqlite
      .prepare('update session set created_at = ? where impersonated_by is not null')
      .run(Date.now() - 2 * IMPERSONATION_SESSION_MS);
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/get-session`, { headers: { cookie } });
    expect(response.status).toBe(HttpStatus.Unauthorized);
    const rows = server.database.sqlite.prepare('select count(*) as n from session where impersonated_by is not null').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);
    await server.stop();
  });

  test('an orphaned impersonation session answers 401 on get-session and its row is gone', async () => {
    const server = await startTestServer();
    const { eve, cookie } = await adminImpersonating({ server });
    server.database.sqlite.prepare('update user set role = ? where id = ?').run(UserRole.User, eve.id);
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/get-session`, { headers: { cookie } });
    expect(response.status).toBe(HttpStatus.Unauthorized);
    const rows = server.database.sqlite.prepare('select count(*) as n from session where impersonated_by is not null').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);
    await server.stop();
  });

  test('demoting the impersonating admin deletes their impersonation sessions and closes the sockets opened through them', async () => {
    const server = await startTestServer();
    const { eve, caio } = await adminImpersonating({ server });
    const closeSockets = vi.spyOn(server.services.runtime, 'closeConnectionsOfUser').mockImplementation(() => undefined);
    const response = await fetch(`${server.baseUrl}${USERS_ROLE_PATH(eve.id)}`, {
      method: HttpMethod.Post,
      headers: { cookie: server.admin.cookie, origin: server.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ role: UserRole.User }),
    });
    expect(response.status).toBe(HttpStatus.Ok);
    const rows = server.database.sqlite.prepare('select count(*) as n from session where impersonated_by = ?').get(eve.id) as { n: number };
    expect(rows.n).toBe(0);
    expect(closeSockets).toHaveBeenCalledWith(caio.id);
    await server.stop();
  });

  test("an impersonator's delete-consent is refused and the user's tokens stay", async () => {
    const server = await startTestServer();
    const { caio, cookie } = await adminImpersonating({ server });
    const { drizzle } = server.database;
    const scopes = ['read'];
    drizzle.insert(oauthClient).values({ id: 'client-row', clientId: 'agent-client', redirectUris: [] }).run();
    drizzle.insert(oauthConsent).values({ id: 'consent-caio', clientId: 'agent-client', userId: caio.id, scopes }).run();
    drizzle
      .insert(oauthRefreshToken)
      .values({ id: 'refresh-caio', token: 'refresh-caio', clientId: 'agent-client', userId: caio.id, scopes })
      .run();
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/oauth2/delete-consent`, {
      method: HttpMethod.Post,
      headers: { cookie, origin: server.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'consent-caio' }),
    });
    expect(response.status).toBe(HttpStatus.Forbidden);
    expect(drizzle.select({ id: oauthRefreshToken.id }).from(oauthRefreshToken).all()).toHaveLength(1);
    await server.stop();
  });

  test('an expired impersonation cookie still signs the admin in and out', async () => {
    const server = await startTestServer();
    const { cookie } = await adminImpersonating({ server });
    server.database.sqlite
      .prepare('update session set created_at = ? where impersonated_by is not null')
      .run(Date.now() - 2 * IMPERSONATION_SESSION_MS);
    const signedIn = await signInRequest({ server, email: server.admin.email, cookie });
    expect(signedIn.status).toBe(HttpStatus.Ok);
    const rows = server.database.sqlite.prepare('select count(*) as n from session where impersonated_by is not null').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);
    await server.stop();
  });

  test('signing out with an expired impersonation cookie succeeds', async () => {
    const server = await startTestServer();
    const { cookie } = await adminImpersonating({ server });
    server.database.sqlite
      .prepare('update session set created_at = ? where impersonated_by is not null')
      .run(Date.now() - 2 * IMPERSONATION_SESSION_MS);
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/sign-out`, {
      method: HttpMethod.Post,
      headers: { cookie, origin: server.baseUrl, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(HttpStatus.Ok);
    await server.stop();
  });

  test.each([
    { path: '/oauth2/consent', method: HttpMethod.Post },
    { path: '/oauth2/authorize', method: HttpMethod.Get },
    { path: '/revoke-other-sessions', method: HttpMethod.Post },
    { path: '/oauth2/continue', method: HttpMethod.Post },
    { path: '/update-user', method: HttpMethod.Post },
  ])('an impersonated session is refused $method $path with 403', async ({ path, method }) => {
    const server = await startTestServer();
    const { cookie } = await adminImpersonating({ server });
    const isPost = method === HttpMethod.Post;
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}${path}`, {
      method,
      headers: { cookie, origin: server.baseUrl, 'content-type': 'application/json' },
      body: isPost ? JSON.stringify({ accept: true }) : undefined,
      redirect: 'manual',
    });
    expect(response.status).toBe(HttpStatus.Forbidden);
    await server.stop();
  });
});
