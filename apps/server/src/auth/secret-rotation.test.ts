import { ApiPath } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { authorizeAgentRequest } from '../agent/agent-authorization';
import { connectAgentClient } from '../testing/oauth-client';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';
import { temporaryDirectory } from '../testing/temporary-directory';

const SECRET_BEFORE_ROTATION = 'the-secret-before-the-rotation-x';
const SECRET_AFTER_ROTATION = 'the-secret-after-the-rotation-yyy';

function bearerRequest({ server, accessToken }: { server: TestServer; accessToken: string }): Request {
  return new Request(`${server.baseUrl}${ApiPath.Mcp}`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } });
}

async function serverThatSignedAnAccessToken(databaseDirectory: string): Promise<void> {
  const before = await startTestServer({ databaseDirectory, authSecret: SECRET_BEFORE_ROTATION, previousAuthSecret: null });
  const user = await signedInUser({ server: before, name: 'Ana' });
  await connectAgentClient({ server: before, user });
  await before.stop();
}

test('an AI app connects after the secret rotates when the previous secret is kept', async () => {
  const databaseDirectory = temporaryDirectory();
  await serverThatSignedAnAccessToken(databaseDirectory);
  const after = await startTestServer({ databaseDirectory, authSecret: SECRET_AFTER_ROTATION, previousAuthSecret: SECRET_BEFORE_ROTATION });
  const user = await signedInUser({ server: after, name: 'Bruno' });
  const client = await connectAgentClient({ server: after, user });
  const principal = await authorizeAgentRequest({
    auth: after.auth,
    jwksUrl: `${after.baseUrl}${ApiPath.Auth}/jwks`,
    request: bearerRequest({ server: after, accessToken: client.accessToken }),
  });
  expect(principal?.userId).toBe(user.id);
  await after.stop();
});

test('without the previous secret the signing key from before the rotation cannot issue tokens', async () => {
  const databaseDirectory = temporaryDirectory();
  await serverThatSignedAnAccessToken(databaseDirectory);
  const after = await startTestServer({ databaseDirectory, authSecret: SECRET_AFTER_ROTATION, previousAuthSecret: null });
  const user = await signedInUser({ server: after, name: 'Bruno' });
  await expect(connectAgentClient({ server: after, user })).rejects.toThrow();
  await after.stop();
});
