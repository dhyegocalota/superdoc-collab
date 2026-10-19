import {
  AdminResource,
  AppRoute,
  adminApiPath,
  ApiPath,
  HttpMethod,
  HttpStatus,
  INVITE_QUERY_PARAMETER,
  INVITE_TOKEN_HEADER,
  PASSWORD_RESET_QUERY_PARAMETER,
  InviteState,
  LAST_ADMIN_MESSAGE,
  UserRole,
  UTC_TIME_ZONE,
  type AdminUser,
  type CreatedInvite,
  type CreatedPasswordReset,
  PASSWORD_RESET_TTL_MS,
  passwordResetApiPath,
  passwordResetTokenOf,
  type InviteSummary,
  inviteTokenOf,
} from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { signedInUser, signInExisting, startTestServer, TEST_USER_PASSWORD, type TestServer } from '../testing/test-server';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const USERS_PATH = adminApiPath(AdminResource.Users);
const INVITES_PATH = adminApiPath(AdminResource.Invites);
const ADMIN_CALLS = [
  { method: HttpMethod.Get, path: USERS_PATH },
  { method: HttpMethod.Get, path: INVITES_PATH },
  { method: HttpMethod.Post, path: INVITES_PATH },
  { method: HttpMethod.Delete, path: `${INVITES_PATH}/x` },
  { method: HttpMethod.Post, path: `${USERS_PATH}/x/role` },
  { method: HttpMethod.Post, path: passwordResetApiPath('x') },
];
const NOW = Date.UTC(2026, 9, 19);
const NEW_PASSWORD = 'a-brand-new-password';
const REQUEST_RESET_PATH = `${ApiPath.Auth}/request-password-reset`;
const RESET_PASSWORD_PATH = `${ApiPath.Auth}/reset-password`;
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
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.202.0.${clientAddress++}`,
      origin: server.baseUrl,
      [INVITE_TOKEN_HEADER]: token,
    },
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
    const token = inviteTokenOf(invite.url);
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

  test('an admin creates a password reset link on the app origin that expires in one hour', async () => {
    const server = await startTestServer({ now: () => NOW });
    const eve = await signedInUser({ server, name: 'Eve' });
    const response = await call({ server, method: HttpMethod.Post, path: passwordResetApiPath(eve.id), cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.Created);
    const reset = (await response.json()) as CreatedPasswordReset;
    expect(reset.url.startsWith(`${server.baseUrl}${AppRoute.ResetPassword}?${PASSWORD_RESET_QUERY_PARAMETER}=`)).toBe(true);
    expect(passwordResetTokenOf(reset.url)).not.toBe('');
    expect(reset.expiresAt).toBe(NOW + PASSWORD_RESET_TTL_MS);
    await server.stop();
  });

  test('a password reset for an unknown user answers 404', async () => {
    const server = await startTestServer();
    const response = await call({ server, method: HttpMethod.Post, path: passwordResetApiPath('nope'), cookie: server.admin.cookie });
    expect(response.status).toBe(HttpStatus.NotFound);
    expect(await response.json()).toEqual({ error: USER_NOT_FOUND_MESSAGE });
    await server.stop();
  });

  test('the link sets a new password once, ends the other sessions and the old password stops working', async () => {
    const server = await startTestServer();
    const eve = await signedInUser({ server, name: 'Eve' });
    const created = await call({ server, method: HttpMethod.Post, path: passwordResetApiPath(eve.id), cookie: server.admin.cookie });
    const token = passwordResetTokenOf(((await created.json()) as CreatedPasswordReset).url);
    const reset = () => call({ server, method: HttpMethod.Post, path: RESET_PASSWORD_PATH, body: { newPassword: NEW_PASSWORD, token } });
    expect((await reset()).status).toBe(HttpStatus.Ok);
    expect((await reset()).status).toBe(HttpStatus.BadRequest);
    const sessionResponse = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie: eve.cookie } });
    expect(((await sessionResponse.json()) as { user: unknown }).user).toBeNull();
    await expect(signInExisting({ server, email: eve.email, password: TEST_USER_PASSWORD })).rejects.toThrow();
    await expect(signInExisting({ server, email: eve.email, password: NEW_PASSWORD })).resolves.toContain('=');
    await server.stop();
  });

  test.each([undefined, 'admin'])('the public request-password-reset path answers 404 (cookie of %s)', async (who) => {
    const server = await startTestServer();
    const cookie = who && server.admin.cookie;
    const response = await call({ server, method: HttpMethod.Post, path: REQUEST_RESET_PATH, cookie, body: { email: server.admin.email } });
    expect(response.status).toBe(HttpStatus.NotFound);
    await server.stop();
  });
});
