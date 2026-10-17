import {
  ApiPath,
  DAY_MS,
  HttpStatus,
  INVITE_TOKEN_HEADER,
  INVITE_TTL_MS,
  InviteState,
  SIGN_UP_BY_INVITATION_MESSAGE,
  UserRole,
  type SessionUser,
  inviteTokenOf,
} from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { currentUserId, signInExisting, startTestServer, TEST_USER_PASSWORD, type TestServer } from '../testing/test-server';

const TIME_ZONE = 'America/Sao_Paulo';
const CONCURRENT_CLAIM_ROUNDS = 10;
let clientAddress = 1;

function signUp({
  server,
  email,
  token,
  timeZone = TIME_ZONE,
  extra = {},
}: {
  server: TestServer;
  email: string;
  token?: string;
  timeZone?: string;
  extra?: Record<string, string>;
}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.201.0.${clientAddress++}` };
  if (token) headers[INVITE_TOKEN_HEADER] = token;
  const body = { name: 'Eve', email, password: TEST_USER_PASSWORD, timeZone, ...extra };
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function userCount({ server, emails }: { server: TestServer; emails: string[] }): number {
  const placeholders = emails.map(() => '?').join(',');
  const row = server.database.sqlite.prepare(`select count(*) as n from user where email in (${placeholders})`).get(...emails) as {
    n: number;
  };
  return row.n;
}

async function meOf({ server, email }: { server: TestServer; email: string }): Promise<SessionUser> {
  const cookie = await signInExisting({ server, email, password: TEST_USER_PASSWORD });
  const response = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } });
  return ((await response.json()) as { user: SessionUser }).user;
}

test('the first sign-up on an unclaimed instance becomes admin and keeps its time zone', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'first@example.com' })).status).toBe(HttpStatus.Ok);
  expect(await meOf({ server, email: 'first@example.com' })).toMatchObject({ role: UserRole.Admin, timeZone: TIME_ZONE });
  await server.stop();
});

test('a token sent on an unclaimed instance does not spoil the claim', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'first@example.com', token: 'anything' })).status).toBe(HttpStatus.Ok);
  expect((await meOf({ server, email: 'first@example.com' })).role).toBe(UserRole.Admin);
  await server.stop();
});

test('a sign-up without a token on a claimed instance is refused and creates no user', async () => {
  const server = await startTestServer();
  const response = await signUp({ server, email: 'eve@example.com' });
  expect(response.status).toBe(HttpStatus.Forbidden);
  expect(await response.json()).toMatchObject({ message: SIGN_UP_BY_INVITATION_MESSAGE });
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('a pending token admits a user once, marks the invite accepted, and the user is not admin', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  expect((await signUp({ server, email: 'eve@example.com', token: inviteTokenOf(invite.url) })).status).toBe(HttpStatus.Ok);
  expect((await signUp({ server, email: 'eve2@example.com', token: inviteTokenOf(invite.url) })).status).toBe(HttpStatus.Forbidden);
  expect(server.services.invites.list()[0]).toMatchObject({ state: InviteState.Accepted, acceptedBy: { name: 'Eve' } });
  expect((await meOf({ server, email: 'eve@example.com' })).role).toBe(UserRole.User);
  await server.stop();
});

test.each(['revoked', 'expired', 'unknown'] as const)('a %s token is refused', async (kind) => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  if (kind === 'revoked') server.services.invites.revoke(invite.id);
  if (kind === 'expired') clock.now += INVITE_TTL_MS + DAY_MS;
  const token = kind === 'unknown' ? 'not-a-token' : inviteTokenOf(invite.url);
  expect((await signUp({ server, email: 'eve@example.com', token })).status).toBe(HttpStatus.Forbidden);
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('an invite that stops being pending after the gate creates no user', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  vi.spyOn(server.services.invites, 'accept').mockReturnValueOnce(false);
  const response = await signUp({ server, email: 'eve@example.com', token: inviteTokenOf(invite.url) });
  expect(response.status).toBe(HttpStatus.Forbidden);
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('a token used by two concurrent sign-ups admits exactly one', async () => {
  const server = await startTestServer();
  const token = inviteTokenOf(server.services.invites.create({ createdBy: server.admin.id }).url);
  const [first, second] = await Promise.all([
    signUp({ server, email: 'a@example.com', token }),
    signUp({ server, email: 'b@example.com', token }),
  ]);
  expect([first.status, second.status].sort()).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
  expect(userCount({ server, emails: ['a@example.com', 'b@example.com'] })).toBe(1);
  await server.stop();
});

test('two concurrent first sign-ups leave exactly one admin and one user, ten rounds', async () => {
  await Array.from({ length: CONCURRENT_CLAIM_ROUNDS }).reduce<Promise<void>>(async (previous, _value, round) => {
    await previous;
    const server = await startTestServer({ claim: false });
    const [first, second] = await Promise.all([
      signUp({ server, email: `a${round}@example.com` }),
      signUp({ server, email: `b${round}@example.com` }),
    ]);
    expect([first.status, second.status].sort()).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
    const roles = server.database.sqlite.prepare('select role from user').all() as { role: string }[];
    expect(roles).toEqual([{ role: UserRole.Admin }]);
    await server.stop();
  }, Promise.resolve());
});

test('a sign-up with an unknown time zone is refused before the gate and claims nothing', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'eve@example.com', timeZone: 'Mars/Olympus' })).status).toBe(HttpStatus.BadRequest);
  expect(server.services.invites.hasAnyUser()).toBe(false);
  await server.stop();
});

test('a sign-up body cannot grant itself the admin role', async () => {
  const server = await startTestServer();
  const token = inviteTokenOf(server.services.invites.create({ createdBy: server.admin.id }).url);
  const response = await signUp({ server, email: 'eve@example.com', token, extra: { role: UserRole.Admin } });
  expect(response.status).toBe(HttpStatus.BadRequest);
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('a sign-in is still normalised by the credentials hook', async () => {
  const server = await startTestServer();
  const cookie = await signInExisting({ server, email: server.admin.email.toUpperCase(), password: TEST_USER_PASSWORD });
  expect(await currentUserId({ server, cookie })).toBe(server.admin.id);
  await server.stop();
});
