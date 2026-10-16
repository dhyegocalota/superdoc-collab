import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export enum MigrationSet {
  History = 'history',
  ReadModel = 'read-model',
}

export const HISTORY_MIGRATIONS_PATH = join('libs', 'history', 'drizzle');

export function runMigrationSet({ sqlite, migrationsFolder }: { sqlite: Database.Database; migrationsFolder: string }): void {
  migrate(drizzle(sqlite), { migrationsFolder });
}
