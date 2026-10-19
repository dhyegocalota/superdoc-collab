import { DEMO_ADMIN, DEMO_USERS, INVITE_TOKEN_HEADER, UTC_TIME_ZONE, type DemoUser, inviteTokenOf } from '@superdoc-collab/types';
import { eq } from 'drizzle-orm';
import type { InvitesRepository } from '../admin/invites';
import type { AuthDatabase } from '../database/connection';
import * as authSchema from '../database/schema/auth';
import type { Auth } from './auth';

type SeedResult = { created: string[]; existing: string[] };

export class MissingDemoPasswordError extends Error {
  constructor() {
    super('Missing environment variable: DEMO_PASSWORD');
  }
}

function inviteHeaders({ invites, adminId }: { invites: InvitesRepository; adminId: string | null }): Headers {
  if (adminId === null) return new Headers();
  const { url } = invites.create({ createdBy: adminId });
  return new Headers({ [INVITE_TOKEN_HEADER]: inviteTokenOf(url) });
}

async function seedOne({
  auth,
  database,
  invites,
  adminId,
  account,
  password,
  result,
}: {
  auth: Auth;
  database: AuthDatabase;
  invites: InvitesRepository;
  adminId: string | null;
  account: DemoUser;
  password: string;
  result: SeedResult;
}): Promise<string> {
  const found = database.drizzle
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, account.email))
    .get();
  if (found) {
    result.existing.push(account.email);
    return found.id;
  }
  const headers = inviteHeaders({ invites, adminId });
  const created = await auth.api.signUpEmail({ body: { ...account, password, timeZone: UTC_TIME_ZONE }, headers });
  result.created.push(account.email);
  return created.user.id;
}

export async function seedDemoUsers({
  auth,
  database,
  invites,
  password,
}: {
  auth: Auth;
  database: AuthDatabase;
  invites: InvitesRepository;
  password: string;
}): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };
  const adminId = await seedOne({ auth, database, invites, adminId: null, account: DEMO_ADMIN, password, result });
  await DEMO_USERS.reduce(async (previous, account) => {
    await previous;
    await seedOne({ auth, database, invites, adminId, account, password, result });
  }, Promise.resolve());
  return result;
}
