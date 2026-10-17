import { DAY_MS, HttpStatus, INVITE_TTL_MS, InviteState, inviteApiPath, inviteTokenOf } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { startTestServer } from '../testing/test-server';

test('a pending token answers pending; accepted, revoked, expired and unknown tokens answer 404 alike', async () => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const lookup = (token: string) => fetch(`${server.baseUrl}${inviteApiPath(token)}`);
  const pending = server.services.invites.create({ createdBy: server.admin.id });
  expect(await (await lookup(inviteTokenOf(pending.url))).json()).toEqual({ state: InviteState.Pending });
  const accepted = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.accept({ id: accepted.id, userId: server.admin.id });
  expect((await lookup(inviteTokenOf(accepted.url))).status).toBe(HttpStatus.NotFound);
  const revoked = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.revoke(revoked.id);
  expect((await lookup(inviteTokenOf(revoked.url))).status).toBe(HttpStatus.NotFound);
  const expired = server.services.invites.create({ createdBy: server.admin.id });
  clock.now += INVITE_TTL_MS + DAY_MS;
  expect((await lookup(inviteTokenOf(expired.url))).status).toBe(HttpStatus.NotFound);
  expect((await lookup('nope')).status).toBe(HttpStatus.NotFound);
  await server.stop();
});
