import { DAY_MS, INVITE_TTL_MS, InviteState, inviteTokenOf } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { startTestServer } from '../testing/test-server';
import { InvitesRepository, RevokeOutcome } from './invites';

const NOW = Date.UTC(2026, 9, 17, 12, 0);
const ONE_SECOND_MS = 1000;

async function repositoryWith(now: () => number) {
  const server = await startTestServer();
  const repository = new InvitesRepository({ database: server.database, appOrigin: server.baseUrl, now });
  return { server, repository, creatorId: server.admin.id };
}

test('create returns a sign-up URL once and stores only the hash', async () => {
  const { server, repository, creatorId } = await repositoryWith(() => NOW);
  const invite = repository.create({ createdBy: creatorId });
  const token = inviteTokenOf(invite.url);
  expect(invite.url.startsWith(`${server.baseUrl}/sign-up?invite=`)).toBe(true);
  expect(invite.expiresAt).toBe(NOW + INVITE_TTL_MS);
  const rows = server.database.sqlite.prepare('select token_hash from invites').all() as { token_hash: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.token_hash).not.toContain(token);
  expect(repository.resolvePending(token)).toEqual({ id: invite.id });
  await server.stop();
});

test('an accepted invite stops resolving and accept is single use', async () => {
  const { server, repository, creatorId } = await repositoryWith(() => NOW);
  const invite = repository.create({ createdBy: creatorId });
  expect(repository.accept({ id: invite.id, userId: creatorId })).toBe(true);
  expect(repository.accept({ id: invite.id, userId: creatorId })).toBe(false);
  expect(repository.resolvePending(inviteTokenOf(invite.url))).toBeNull();
  expect(repository.list()[0]?.state).toBe(InviteState.Accepted);
  await server.stop();
});

test('revoke marks a pending invite, refuses an accepted one and reports unknown ids; the list is newest first', async () => {
  const clock = { now: NOW };
  const { server, repository, creatorId } = await repositoryWith(() => clock.now);
  const pending = repository.create({ createdBy: creatorId });
  clock.now += ONE_SECOND_MS;
  const accepted = repository.create({ createdBy: creatorId });
  repository.accept({ id: accepted.id, userId: creatorId });
  expect(repository.revoke(pending.id)).toBe(RevokeOutcome.Revoked);
  expect(repository.revoke(accepted.id)).toBe(RevokeOutcome.AlreadyAccepted);
  expect(repository.revoke('nope')).toBe(RevokeOutcome.NotFound);
  expect(repository.list().map((invite) => invite.state)).toEqual([InviteState.Accepted, InviteState.Revoked]);
  await server.stop();
});

test('an invite expires after seven days', async () => {
  const clock = { now: NOW };
  const { server, repository, creatorId } = await repositoryWith(() => clock.now);
  const invite = repository.create({ createdBy: creatorId });
  clock.now = NOW + INVITE_TTL_MS;
  expect(repository.resolvePending(inviteTokenOf(invite.url))).toBeNull();
  expect(repository.list()[0]?.state).toBe(InviteState.Expired);
  clock.now = NOW + INVITE_TTL_MS - DAY_MS;
  expect(repository.resolvePending(inviteTokenOf(invite.url))).toEqual({ id: invite.id });
  await server.stop();
});

test('list names the creator and the acceptor', async () => {
  const { server, repository, creatorId } = await repositoryWith(() => NOW);
  const invite = repository.create({ createdBy: creatorId });
  repository.accept({ id: invite.id, userId: creatorId });
  expect(repository.list()[0]).toMatchObject({ createdBy: { name: 'Admin' }, acceptedBy: { name: 'Admin' } });
  await server.stop();
});
