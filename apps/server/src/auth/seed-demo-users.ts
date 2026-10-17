import { DEMO_USERS } from '@superdoc-collab/types';
import { eq } from 'drizzle-orm';
import type { AuthDatabase } from '../database/connection';
import * as authSchema from '../database/schema/auth';
import type { Auth } from './auth';

export type SeedResult = { created: string[]; existing: string[] };

export class MissingDemoPasswordError extends Error {
  constructor() {
    super('Missing environment variable: DEMO_PASSWORD');
  }
}

export async function seedDemoUsers({
  auth,
  database,
  password,
}: {
  auth: Auth;
  database: AuthDatabase;
  password: string;
}): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };
  for (const { name, email } of DEMO_USERS) {
    const [found] = database.drizzle
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.email, email))
      .limit(1)
      .all();
    if (found) {
      result.existing.push(email);
      continue;
    }
    await auth.api.signUpEmail({ body: { name, email, password } });
    result.created.push(email);
  }
  return result;
}
