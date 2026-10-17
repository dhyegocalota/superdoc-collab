import { ApiPath, DEMO_USERS } from '@superdoc-history/types';
import { describe, expect, test } from 'vitest';
import { seedDemoUsers } from './seed-demo-users';
import { startTestServer } from '../testing/test-server';

const DEMO_PASSWORD = 'superdoc-demo';
const SIGN_IN_CLIENT_ADDRESS = '10.210.0.1';
const SIGN_IN_EMAIL = 'ana@example.com';

describe('seedDemoUsers', () => {
  test('creates the four demo users once and reports them as existing afterwards', async () => {
    const server = await startTestServer();
    const first = await seedDemoUsers({ auth: server.auth, database: server.database, password: DEMO_PASSWORD });
    expect(first.created).toEqual(DEMO_USERS.map((user) => user.email));
    const second = await seedDemoUsers({ auth: server.auth, database: server.database, password: DEMO_PASSWORD });
    expect(second).toEqual({ created: [], existing: DEMO_USERS.map((user) => user.email) });
    await server.stop();
  });
  test('a seeded user can sign in with the demo password', async () => {
    const server = await startTestServer();
    await seedDemoUsers({ auth: server.auth, database: server.database, password: DEMO_PASSWORD });
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': SIGN_IN_CLIENT_ADDRESS, origin: server.baseUrl },
      body: JSON.stringify({ email: SIGN_IN_EMAIL, password: DEMO_PASSWORD }),
    });
    expect(response.status).toBe(200);
    await server.stop();
  });
});
