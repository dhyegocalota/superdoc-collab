import { ApiPath, HttpMethod, HttpStatus, UserRole } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { signedInUser, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';

const PLUGIN_ADMIN_PATHS = ['impersonate-user', 'set-role', 'create-user', 'set-user-password', 'remove-user', 'ban-user', 'list-users'];

test.each(PLUGIN_ADMIN_PATHS)('/api/auth/admin/%s is 404 even for the admin', async (path) => {
  const server = await startTestServer();
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/admin/${path}`, {
    method: HttpMethod.Post,
    headers: { cookie: server.admin.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: JSON.stringify({ userId: server.admin.id, role: UserRole.User, email: 'x@example.com', password: TEST_USER_PASSWORD, name: 'X' }),
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
