import type Database from 'better-sqlite3';
import { HISTORY_MIGRATIONS_PATH, runMigrationSet, type MigrationSet } from '@superdoc-collab/history';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthDatabase } from './connection';

const AUTH_MIGRATIONS_PATH = 'drizzle';
const MIGRATIONS_JOURNAL_PATH = join('meta', '_journal.json');

export class MigrationsFolderNotFoundError extends Error {
  constructor(startUrl: string) {
    super(`Migrations folder not found above: ${startUrl}`);
  }
}

export function findMigrationsFolder({ startUrl, relativePath }: { startUrl: string; relativePath: string }): string {
  let directory = dirname(fileURLToPath(startUrl));
  while (!existsSync(join(directory, relativePath, MIGRATIONS_JOURNAL_PATH))) {
    const parent = dirname(directory);
    if (parent === directory) throw new MigrationsFolderNotFoundError(startUrl);
    directory = parent;
  }
  return join(directory, relativePath);
}

export function runMigrations(database: AuthDatabase): void {
  migrate(database.drizzle, { migrationsFolder: findMigrationsFolder({ startUrl: import.meta.url, relativePath: AUTH_MIGRATIONS_PATH }) });
}

export function runHistoryMigrations({ sqlite, set }: { sqlite: Database.Database; set: MigrationSet }): void {
  runMigrationSet({
    sqlite,
    migrationsFolder: findMigrationsFolder({ startUrl: import.meta.url, relativePath: join(HISTORY_MIGRATIONS_PATH, set) }),
  });
}
