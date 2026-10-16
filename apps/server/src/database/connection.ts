import Database from 'better-sqlite3';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as authSchema from './schema/auth';

export const AUTH_DATABASE_FILE = 'auth.sqlite';

export class DatabaseDirectoryNotWritableError extends Error {
  constructor(directory: string) {
    super(`Database directory is not writable: ${directory}`);
  }
}

export type AuthDatabase = { sqlite: Database.Database; drizzle: BetterSQLite3Database<typeof authSchema> };

function ensureWritableDirectory(directory: string): void {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  try {
    accessSync(directory, constants.W_OK);
  } catch {
    throw new DatabaseDirectoryNotWritableError(directory);
  }
}

export function openDatabase({ directory, fileName }: { directory: string; fileName: string }): AuthDatabase {
  ensureWritableDirectory(directory);
  const sqlite = new Database(join(directory, fileName));
  sqlite.pragma('journal_mode = WAL');
  return { sqlite, drizzle: drizzle(sqlite, { schema: authSchema }) };
}
