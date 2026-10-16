import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { MigrationsFolderNotFoundError, findMigrationsFolder } from './migrate';

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
