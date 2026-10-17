import { DEMO_USERS } from '../libs/types/src';
import { connectAiClient, revokeInConnectedApps } from './agent';
import { expect, signedInContext, test } from './fixtures';

const ANA = DEMO_USERS[0]!;

test('consent approval hands the client an access token and lists it in Connected apps', async ({ browser, request }) => {
  const ana = await signedInContext({ browser, user: ANA });
  const connection = await connectAiClient({ page: await ana.context.newPage(), request });
  expect(connection.accessToken.length).toBeGreaterThan(0);
  await revokeInConnectedApps({ page: await ana.context.newPage(), clientName: connection.clientName });
});
