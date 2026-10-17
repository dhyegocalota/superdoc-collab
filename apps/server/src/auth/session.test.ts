import { describe, expect, test } from 'vitest';
import { readSession } from './session';
import { startTestServer } from '../testing/test-server';

describe('readSession', () => {
  test('returns null for a garbage cookie', async () => {
    const server = await startTestServer();
    expect(await readSession({ auth: server.auth, headers: new Headers({ cookie: 'better-auth.session_token=garbage' }) })).toBeNull();
    await server.stop();
  });
});
