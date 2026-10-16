import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { MigrationSet } from '@superdoc-history/history';
import { openSqliteFile } from './connection';
import { MigrationsFolderNotFoundError, findMigrationsFolder, runHistoryMigrations } from './migrate';

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'superdoc-history-'));
}

describe('findMigrationsFolder', () => {
  test('finds the drizzle folder above the bundle directory', () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, 'drizzle', 'meta'), { recursive: true });
    writeFileSync(join(root, 'drizzle', 'meta', '_journal.json'), '{}');
    mkdirSync(join(root, 'dist'));
    const bundle = join(root, 'dist', 'main.js');
    writeFileSync(bundle, '');
    expect(findMigrationsFolder({ startUrl: pathToFileURL(bundle).href, relativePath: 'drizzle' })).toBe(join(root, 'drizzle'));
  });
  test('throws a named error when no drizzle folder exists above the start', () => {
    const root = temporaryDirectory();
    const bundle = pathToFileURL(join(root, 'main.js')).href;
    expect(() => findMigrationsFolder({ startUrl: bundle, relativePath: 'drizzle' })).toThrow(MigrationsFolderNotFoundError);
  });
});

describe('runHistoryMigrations', () => {
  test('creates the update log tables for the history set', () => {
    const sqlite = openSqliteFile({ directory: temporaryDirectory(), fileName: 'history.sqlite' });
    runHistoryMigrations({ sqlite, set: MigrationSet.History });
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(['updates', 'snapshots', 'client_identities']));
    sqlite.close();
  });
});
