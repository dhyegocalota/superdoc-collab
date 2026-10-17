import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { MigrationSet, runMigrationSet } from '../migrations';

export function temporaryDatabasePath(set: MigrationSet): string {
  return join(mkdtempSync(join(tmpdir(), 'superdoc-collab-lib-')), `${set}.sqlite`);
}

export function openTestDatabase({ set, path = temporaryDatabasePath(set) }: { set: MigrationSet; path?: string }): Database.Database {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  runMigrationSet({ sqlite, migrationsFolder: fileURLToPath(new URL(`../../drizzle/${set}`, import.meta.url)) });
  return sqlite;
}
