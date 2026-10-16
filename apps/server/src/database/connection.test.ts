import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { AUTH_DATABASE_FILE, DatabaseDirectoryNotWritableError, openDatabase } from './connection';
import { runMigrations } from './migrate';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'superdoc-history-'));
}

describe('openDatabase', () => {
  test('creates the auth tables after migrating', () => {
    const database = openDatabase({ directory: temporaryDirectory(), fileName: AUTH_DATABASE_FILE });
    runMigrations(database);
    const tables = database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(['account', 'session', 'user', 'verification']));
    database.sqlite.close();
  });
  test('migrating twice is idempotent', () => {
    const database = openDatabase({ directory: temporaryDirectory(), fileName: AUTH_DATABASE_FILE });
    runMigrations(database);
    expect(() => runMigrations(database)).not.toThrow();
    database.sqlite.close();
  });
  test('fails with a named error when the directory is not writable', () => {
    const directory = temporaryDirectory();
    chmodSync(directory, 0o500);
    expect(() => openDatabase({ directory, fileName: AUTH_DATABASE_FILE })).toThrow(DatabaseDirectoryNotWritableError);
  });
});
