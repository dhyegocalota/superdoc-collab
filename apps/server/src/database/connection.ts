import Database from 'better-sqlite3';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as authSchema from './schema/auth';
import * as documentsSchema from './schema/documents';

const BUSY_TIMEOUT_MS = 5000;
export const AUTH_DATABASE_FILE = 'auth.sqlite';
export const HISTORY_DATABASE_FILE = 'history.sqlite';
export const READ_MODEL_DATABASE_FILE = 'read-model.sqlite';
export const DOCUMENT_FILES_DIRECTORY = 'documents';

export class DatabaseDirectoryNotWritableError extends Error {
  constructor(directory: string) {
    super(`Database directory is not writable: ${directory}`);
  }
}

const schema = { ...authSchema, ...documentsSchema };

export type AuthDatabase = { sqlite: Database.Database; drizzle: BetterSQLite3Database<typeof schema> };

function ensureWritableDirectory(directory: string): void {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  try {
    accessSync(directory, constants.W_OK);
  } catch {
    throw new DatabaseDirectoryNotWritableError(directory);
  }
}

export function openSqliteFile({ directory, fileName }: { directory: string; fileName: string }): Database.Database {
  ensureWritableDirectory(directory);
  const sqlite = new Database(join(directory, fileName));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return sqlite;
}

export function openDatabase({ directory, fileName }: { directory: string; fileName: string }): AuthDatabase {
  const sqlite = openSqliteFile({ directory, fileName });
  return { sqlite, drizzle: drizzle(sqlite, { schema }) };
}
