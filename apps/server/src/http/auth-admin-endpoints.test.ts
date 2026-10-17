import { ApiPath, HttpMethod, HttpStatus, UserRole } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { signedInUser, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';

const PLUGIN_ADMIN_CALLS = [
  { path: 'impersonate-user', method: HttpMethod.Post },
  { path: 'set-role', method: HttpMethod.Post },
  { path: 'create-user', method: HttpMethod.Post },
  { path: 'set-user-password', method: HttpMethod.Post },
  { path: 'remove-user', method: HttpMethod.Post },
  { path: 'ban-user', method: HttpMethod.Post },
  { path: 'list-users', method: HttpMethod.Get },
];

function bodyFor({ method, userId }: { method: HttpMethod; userId: string }): string | undefined {
  if (method === HttpMethod.Get) return undefined;
  return JSON.stringify({ userId, role: UserRole.User, email: 'x@example.com', password: TEST_USER_PASSWORD, name: 'X' });
}

test.each(PLUGIN_ADMIN_CALLS)('$method /api/auth/admin/$path is 404 even for the admin', async ({ path, method }) => {
  const server = await startTestServer();
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/admin/${path}`, {
    method,
    headers: { cookie: server.admin.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: bodyFor({ method, userId: server.admin.id }),
  });
  expect(response.status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('update-user cannot change the role', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/update-user`, {
    method: HttpMethod.Post,
    headers: { cookie: eve.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: JSON.stringify({ role: UserRole.Admin }),
  });
  expect(response.status).toBe(HttpStatus.BadRequest);
  const row = server.database.sqlite.prepare('select role from user where id = ?').get(eve.id) as { role: string };
  expect(row.role).toBe(UserRole.User);
  await server.stop();
});

test.each([
  ['an unknown zone', 'Mars/Olympus', HttpStatus.BadRequest],
  ['an oversized value', 'x'.repeat(1_000), HttpStatus.BadRequest],
  ['a body above the auth body limit', 'x'.repeat(200_000), HttpStatus.PayloadTooLarge],
  ['a known zone', 'America/Sao_Paulo', HttpStatus.Ok],
])('update-user with %s answers the right status', async (_name, timeZone, expected) => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/update-user`, {
    method: HttpMethod.Post,
    headers: { cookie: eve.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: JSON.stringify({ timeZone }),
  });
  expect(response.status).toBe(expected);
  await server.stop();
});

test('update-user stores the canonical spelling of a time zone alias', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  await fetch(`${server.baseUrl}${ApiPath.Auth}/update-user`, {
    method: HttpMethod.Post,
    headers: { cookie: eve.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: JSON.stringify({ timeZone: 'us/eastern' }),
  });
  const row = server.database.sqlite.prepare('select time_zone as timeZone from user where id = ?').get(eve.id) as { timeZone: string };
  expect(row.timeZone).toBe('America/New_York');
  await server.stop();
});
