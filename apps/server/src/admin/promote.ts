import { pathToFileURL } from 'node:url';
import { UserRole } from '@superdoc-history/types';
import { eq } from 'drizzle-orm';
import { loadEnvironment } from '../config/environment';
import { AUTH_DATABASE_FILE, openDatabase, type AuthDatabase } from '../database/connection';
import { runMigrations } from '../database/migrate';
import { user } from '../database/schema/auth';

const FAILURE_EXIT_CODE = 1;
const EMAIL_ARGUMENT_INDEX = 2;
const USAGE_MESSAGE = 'Usage: node dist/admin-promote.js <email>';

export enum PromoteOutcome {
  Promoted = 'promoted',
  NotFound = 'not-found',
}

export function promoteByEmail({ database, email }: { database: AuthDatabase; email: string }): PromoteOutcome {
  const result = database.drizzle.update(user).set({ role: UserRole.Admin }).where(eq(user.email, email)).run();
  if (result.changes === 1) return PromoteOutcome.Promoted;
  return PromoteOutcome.NotFound;
}

function main(): void {
  const email = process.argv[EMAIL_ARGUMENT_INDEX];
  if (!email) {
    console.error(USAGE_MESSAGE);
    process.exit(FAILURE_EXIT_CODE);
  }
  const environment = loadEnvironment(process.env);
  const database = openDatabase({ directory: environment.databaseDirectory, fileName: AUTH_DATABASE_FILE });
  try {
    runMigrations(database);
    const outcome = promoteByEmail({ database, email });
    console.log(`${email}: ${outcome}`);
    if (outcome === PromoteOutcome.NotFound) process.exitCode = FAILURE_EXIT_CODE;
  } finally {
    database.sqlite.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] as string).href) main();
