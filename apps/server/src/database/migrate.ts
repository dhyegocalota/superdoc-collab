import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthDatabase } from './connection';

const MIGRATIONS_FOLDER_NAME = 'drizzle';
const MIGRATIONS_JOURNAL_PATH = join('meta', '_journal.json');

export class MigrationsFolderNotFoundError extends Error {
  constructor(startUrl: string) {
    super(`Migrations folder not found above: ${startUrl}`);
  }
}

export function findMigrationsFolder(startUrl: string): string {
  let directory = dirname(fileURLToPath(startUrl));
  while (!existsSync(join(directory, MIGRATIONS_FOLDER_NAME, MIGRATIONS_JOURNAL_PATH))) {
    const parent = dirname(directory);
    if (parent === directory) throw new MigrationsFolderNotFoundError(startUrl);
    directory = parent;
  }
  return join(directory, MIGRATIONS_FOLDER_NAME);
}

export function runMigrations(database: AuthDatabase): void {
  migrate(database.drizzle, { migrationsFolder: findMigrationsFolder(import.meta.url) });
}
