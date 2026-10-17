import { UserRole } from '@superdoc-history/types';
import { describe, expect, test } from 'vitest';
import { readSession, SessionUserWithoutRoleError } from './session';
import { signedInOwner, startTestServer, TEST_TIME_ZONE } from '../testing/test-server';

describe('readSession', () => {
  test('returns null for a garbage cookie', async () => {
    const server = await startTestServer();
    expect(await readSession({ auth: server.auth, headers: new Headers({ cookie: 'better-auth.session_token=garbage' }) })).toBeNull();
    await server.stop();
  });

  test('the session user carries role and time zone', async () => {
    const { server, owner } = await signedInOwner();
    const user = await readSession({ auth: server.auth, headers: new Headers({ cookie: owner.cookie }) });
    expect(user).toMatchObject({ role: UserRole.User, timeZone: TEST_TIME_ZONE });
    await server.stop();
  });

  test('a session whose user has no role is an error, never a default', async () => {
    const { server, owner } = await signedInOwner();
    server.database.sqlite.prepare("update user set role = '' where id = ?").run(owner.id);
    await expect(readSession({ auth: server.auth, headers: new Headers({ cookie: owner.cookie }) })).rejects.toThrow(
      SessionUserWithoutRoleError,
    );
    await server.stop();
  });
});
