import { ApiPath, DAY_MS, HttpStatus, INVITE_TOKEN_HEADER, INVITE_TTL_MS, InviteState, inviteTokenOf } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { startTestServer } from '../testing/test-server';

test('a pending token answers pending; accepted, revoked, expired and unknown tokens answer 404 alike', async () => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const lookup = (token: string) => fetch(`${server.baseUrl}${ApiPath.Invites}`, { headers: { [INVITE_TOKEN_HEADER]: token } });
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

test('a token in the URL path is never looked up, so access logs never hold a live invite', async () => {
  const server = await startTestServer();
  const pending = server.services.invites.create({ createdBy: server.admin.id });
  expect((await fetch(`${server.baseUrl}${ApiPath.Invites}/${inviteTokenOf(pending.url)}`)).status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('a lookup without the header answers 404', async () => {
  const server = await startTestServer();
  expect((await fetch(`${server.baseUrl}${ApiPath.Invites}`)).status).toBe(HttpStatus.NotFound);
  await server.stop();
});
