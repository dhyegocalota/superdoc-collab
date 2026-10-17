import { UserRole } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { serverBuildOptions } from '../../tsup.config';
import { signedInUser, startTestServer } from '../testing/test-server';
import { promoteByEmail, PromoteOutcome } from './promote';

test('promote sets the role of an existing email and reports unknown emails', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  expect(promoteByEmail({ database: server.database, email: eve.email })).toBe(PromoteOutcome.Promoted);
  expect(server.database.sqlite.prepare('select role from user where id = ?').get(eve.id)).toEqual({ role: UserRole.Admin });
  expect(promoteByEmail({ database: server.database, email: 'nobody@example.com' })).toBe(PromoteOutcome.NotFound);
  await server.stop();
});

test('the build emits the promote entry', () => {
  expect(serverBuildOptions.entry).toMatchObject({ 'admin-promote': 'src/admin/promote.ts' });
});

test('promote matches the email whatever its case and surrounding spaces', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  expect(promoteByEmail({ database: server.database, email: `  ${eve.email.toUpperCase()} ` })).toBe(PromoteOutcome.Promoted);
  await server.stop();
});
