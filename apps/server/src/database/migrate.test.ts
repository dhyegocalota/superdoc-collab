import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { temporaryDirectory } from '../testing/temporary-directory';
import { AUTH_DATABASE_FILE, openDatabase } from './connection';
import { selectionSummaries, topicSummaries } from './schema/insights';
import { MigrationsFolderNotFoundError, findMigrationsFolder, runMigrations } from './migrate';

const CLEAR_SUMMARIES_MIGRATION = '0007_clear-summaries.sql';

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

describe('the clear-summaries migration', () => {
  test('empties both summary tables so every sentence is rewritten in en-US', () => {
    const database = openDatabase({ directory: temporaryDirectory(), fileName: AUTH_DATABASE_FILE });
    runMigrations(database);
    database.sqlite.pragma('foreign_keys = OFF');
    database.drizzle.insert(topicSummaries).values({ topicId: 't1', sentence: 'Ana subiu o orçamento.', computedAtSequence: 1 }).run();
    database.drizzle
      .insert(selectionSummaries)
      .values({
        documentId: 'd1',
        filterKey: 'all',
        sentence: 'Ana subiu o orçamento.',
        authors: [],
        computedAtSequence: 1,
        updatedAt: new Date(),
      })
      .run();
    database.sqlite.exec(
      readFileSync(join(findMigrationsFolder({ startUrl: import.meta.url, relativePath: 'drizzle' }), CLEAR_SUMMARIES_MIGRATION), 'utf8'),
    );
    expect([
      database.drizzle.select().from(topicSummaries).all().length,
      database.drizzle.select().from(selectionSummaries).all().length,
    ]).toEqual([0, 0]);
    database.sqlite.close();
  });
});
