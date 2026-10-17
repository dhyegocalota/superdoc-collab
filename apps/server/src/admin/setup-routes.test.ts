import { ApiPath } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { signInAndGetCookie, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';

test('setup reports unclaimed, then claimed after the first sign-up', async () => {
  const server = await startTestServer({ claim: false });
  expect(await (await fetch(`${server.baseUrl}${ApiPath.Setup}`)).json()).toEqual({ claimed: false });
  await signInAndGetCookie({ server, credentials: { name: 'First', email: 'first@example.com', password: TEST_USER_PASSWORD } });
  expect(await (await fetch(`${server.baseUrl}${ApiPath.Setup}`)).json()).toEqual({ claimed: true });
  await server.stop();
});
