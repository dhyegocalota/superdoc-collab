import { ApiPath, DEMO_ADMIN, DEMO_USERS, UserRole, UTC_TIME_ZONE } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { seedDemoUsers } from './seed-demo-users';
import { startTestServer, type TestServer } from '../testing/test-server';

const DEMO_PASSWORD = 'superdoc-demo';
const SIGN_IN_CLIENT_ADDRESS = '10.210.0.1';
const SIGN_IN_EMAIL = 'ana@example.com';
const ALL_DEMO_EMAILS = [DEMO_ADMIN, ...DEMO_USERS].map((user) => user.email);

function seed(server: TestServer) {
  return seedDemoUsers({ auth: server.auth, database: server.database, invites: server.services.invites, password: DEMO_PASSWORD });
}

describe('seedDemoUsers', () => {
  test('creates the admin and the four demo users once and reports them as existing afterwards', async () => {
    const server = await startTestServer({ claim: false });
    const first = await seed(server);
    expect(first.created).toEqual(ALL_DEMO_EMAILS);
    const second = await seed(server);
    expect(second).toEqual({ created: [], existing: ALL_DEMO_EMAILS });
    await server.stop();
  });
  test('the seed claims the instance with the admin and admits the demo users by invite', async () => {
    const server = await startTestServer({ claim: false });
    await seed(server);
    const rows = server.database.sqlite.prepare('select email, role, time_zone from user order by created_at, id').all() as {
      email: string;
      role: string;
      time_zone: string;
    }[];
    expect(rows[0]).toEqual({ email: DEMO_ADMIN.email, role: UserRole.Admin, time_zone: UTC_TIME_ZONE });
    expect(rows.slice(1).every((row) => row.role === UserRole.User)).toBe(true);
    const invitesBefore = server.services.invites.list().length;
    await seed(server);
    expect(server.services.invites.list()).toHaveLength(invitesBefore);
    await server.stop();
  });
  test('a seeded user can sign in with the demo password', async () => {
    const server = await startTestServer({ claim: false });
    await seed(server);
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': SIGN_IN_CLIENT_ADDRESS },
      body: JSON.stringify({ email: SIGN_IN_EMAIL, password: DEMO_PASSWORD }),
    });
    expect(response.status).toBe(200);
    await server.stop();
  });
});
