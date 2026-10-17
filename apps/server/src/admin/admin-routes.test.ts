import {
  AdminResource,
  adminApiPath,
  ApiPath,
  HttpMethod,
  HttpStatus,
  INVITE_QUERY_PARAMETER,
  INVITE_TOKEN_HEADER,
  InviteState,
  LAST_ADMIN_MESSAGE,
  UserRole,
  UTC_TIME_ZONE,
  type AdminUser,
  type CreatedInvite,
  type InviteSummary,
} from '@superdoc-history/types';
import { describe, expect, test } from 'vitest';
import { signedInUser, startTestServer, TEST_USER_PASSWORD, type TestServer } from '../testing/test-server';

const USERS_PATH = adminApiPath(AdminResource.Users);
const INVITES_PATH = adminApiPath(AdminResource.Invites);
const ADMIN_CALLS = [
  { method: HttpMethod.Get, path: USERS_PATH },
  { method: HttpMethod.Get, path: INVITES_PATH },
  { method: HttpMethod.Post, path: INVITES_PATH },
  { method: HttpMethod.Delete, path: `${INVITES_PATH}/x` },
  { method: HttpMethod.Post, path: `${USERS_PATH}/x/role` },
];
let clientAddress = 1;

function call({
  server,
  method,
  path,
  cookie,
  body,
}: {
  server: TestServer;
  method: HttpMethod;
  path: string;
  cookie?: string;
  body?: Record<string, string>;
}): Promise<Response> {
  const headers: Record<string, string> = { origin: server.baseUrl, 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return fetch(`${server.baseUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
}

function setRole({ server, id, role, cookie }: { server: TestServer; id: string; role: string; cookie: string }): Promise<Response> {
  return call({ server, method: HttpMethod.Post, path: `${USERS_PATH}/${id}/role`, cookie, body: { role } });
}

function signUpWithToken({ server, email, token }: { server: TestServer; email: string; token: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, {
    method: HttpMethod.Post,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.202.0.${clientAddress++}`, [INVITE_TOKEN_HEADER]: token },
    body: JSON.stringify({ name: 'Eve', email, password: TEST_USER_PASSWORD, timeZone: UTC_TIME_ZONE }),
  });
}

describe('admin routes', () => {
  test.each(ADMIN_CALLS)('$method $path is 401 signed out and 403 for a user', async ({ method, path }) => {
    const server = await startTestServer();
    const user = await signedInUser({ server, name: 'Eve' });
    expect((await call({ server, method, path })).status).toBe(HttpStatus.Unauthorized);
    expect((await call({ server, method, path, cookie: user.cookie })).status).toBe(HttpStatus.Forbidden);
    await server.stop();
  });

  test('an admin lists users with roles and creation times', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    const response = await call({ server, method: HttpMethod.Get, path: USERS_PATH, cookie: server.admin.cookie });
    const users = (await response.json()) as AdminUser[];
    expect(users.map((user) => [user.email, user.role])).toEqual([
      [server.admin.email, UserRole.Admin],
      [eve.email, UserRole.User],
    ]);
    expect(typeof users[0]!.createdAt).toBe('number');
    await server.stop();
  });

  test('an admin creates an invite, sees it pending, and its URL admits exactly one sign-up', async () => {
    const server = await startTestServer();
    const created = await call({ server, method: HttpMethod.Post, path: INVITES_PATH, cookie: server.admin.cookie });
    expect(created.status).toBe(HttpStatus.Created);
    const invite = (await created.json()) as CreatedInvite;
    expect(invite.url.startsWith(`${server.baseUrl}/sign-up?${INVITE_QUERY_PARAMETER}=`)).toBe(true);
    const listed = await call({ server, method: HttpMethod.Get, path: INVITES_PATH, cookie: server.admin.cookie });
    const list = (await listed.json()) as InviteSummary[];
    expect(list[0]).toMatchObject({ id: invite.id, state: InviteState.Pending, createdBy: { name: 'Admin' }, acceptedBy: null });
    const token = new URL(invite.url).searchParams.get(INVITE_QUERY_PARAMETER) as string;
    const first = await signUpWithToken({ server, email: 'one@example.com', token });
    const second = await signUpWithToken({ server, email: 'two@example.com', token });
    expect([first.status, second.status]).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
    await server.stop();
  });

  test('revoking a pending invite answers 204; an accepted one 409; unknown 404', async () => {
    const server = await startTestServer();
    const pending = server.services.invites.create({ createdBy: server.admin.id });
    const accepted = server.services.invites.create({ createdBy: server.admin.id });
    server.services.invites.accept({ id: accepted.id, userId: server.admin.id });
    const revoke = (id: string) => call({ server, method: HttpMethod.Delete, path: `${INVITES_PATH}/${id}`, cookie: server.admin.cookie });
    expect((await revoke(pending.id)).status).toBe(HttpStatus.NoContent);
    expect((await revoke(accepted.id)).status).toBe(HttpStatus.Conflict);
    expect((await revoke('nope')).status).toBe(HttpStatus.NotFound);
    await server.stop();
  });

  test('roles: promote, step down with another admin present, never demote the last admin, 404 and 400', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    expect((await setRole({ server, id: eve.id, role: UserRole.Admin, cookie: server.admin.cookie })).status).toBe(HttpStatus.Ok);
    expect((await setRole({ server, id: server.admin.id, role: UserRole.User, cookie: server.admin.cookie })).status).toBe(HttpStatus.Ok);
    const last = await setRole({ server, id: eve.id, role: UserRole.User, cookie: eve.cookie });
    expect(last.status).toBe(HttpStatus.Conflict);
    expect(await last.json()).toEqual({ error: LAST_ADMIN_MESSAGE });
    expect((await setRole({ server, id: 'nope', role: UserRole.User, cookie: eve.cookie })).status).toBe(HttpStatus.NotFound);
    expect((await setRole({ server, id: eve.id, role: 'king', cookie: eve.cookie })).status).toBe(HttpStatus.BadRequest);
    await server.stop();
  });

  test('two admins demoting each other at once leave one admin', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    await setRole({ server, id: eve.id, role: UserRole.Admin, cookie: server.admin.cookie });
    await Promise.all([
      setRole({ server, id: eve.id, role: UserRole.User, cookie: server.admin.cookie }),
      setRole({ server, id: server.admin.id, role: UserRole.User, cookie: eve.cookie }),
    ]);
    const admins = server.database.sqlite.prepare("select count(*) as n from user where role = 'admin'").get() as { n: number };
    expect(admins.n).toBe(1);
    await server.stop();
  });
});
