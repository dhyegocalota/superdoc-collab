import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import type { AuthDatabase } from './connection';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function runMigrations(database: AuthDatabase): void {
  migrate(database.drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
}
