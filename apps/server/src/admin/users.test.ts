import { UserRole } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';
import { SetRoleOutcome } from './users';

function archive({ server, id }: { server: TestServer; id: string }): void {
  server.database.sqlite.prepare('update user set banned = 1 where id = ?').run(id);
}

test('an archived admin does not count: demoting the only active admin answers last-admin', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  server.services.adminUsers.setRole({ id: eve.id, role: UserRole.Admin });
  archive({ server, id: eve.id });
  expect(server.services.adminUsers.setRole({ id: server.admin.id, role: UserRole.User })).toBe(SetRoleOutcome.LastAdmin);
  await server.stop();
});

test('demoting an archived admin is allowed while an active admin remains', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  server.services.adminUsers.setRole({ id: eve.id, role: UserRole.Admin });
  archive({ server, id: eve.id });
  expect(server.services.adminUsers.setRole({ id: eve.id, role: UserRole.User })).toBe(SetRoleOutcome.Updated);
  await server.stop();
});
