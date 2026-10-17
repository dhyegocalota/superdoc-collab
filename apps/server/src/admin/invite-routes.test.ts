import { DAY_MS, HttpStatus, INVITE_QUERY_PARAMETER, INVITE_TTL_MS, InviteState, inviteApiPath } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { startTestServer } from '../testing/test-server';

function tokenOf(url: string): string {
  return new URL(url).searchParams.get(INVITE_QUERY_PARAMETER) as string;
}

test('a pending token answers pending; accepted, revoked, expired and unknown tokens answer 404 alike', async () => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const lookup = (token: string) => fetch(`${server.baseUrl}${inviteApiPath(token)}`);
  const pending = server.services.invites.create({ createdBy: server.admin.id });
  expect(await (await lookup(tokenOf(pending.url))).json()).toEqual({ state: InviteState.Pending });
  const accepted = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.accept({ id: accepted.id, userId: server.admin.id });
  expect((await lookup(tokenOf(accepted.url))).status).toBe(HttpStatus.NotFound);
  const revoked = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.revoke(revoked.id);
  expect((await lookup(tokenOf(revoked.url))).status).toBe(HttpStatus.NotFound);
  const expired = server.services.invites.create({ createdBy: server.admin.id });
  clock.now += INVITE_TTL_MS + DAY_MS;
  expect((await lookup(tokenOf(expired.url))).status).toBe(HttpStatus.NotFound);
  expect((await lookup('nope')).status).toBe(HttpStatus.NotFound);
  await server.stop();
});
