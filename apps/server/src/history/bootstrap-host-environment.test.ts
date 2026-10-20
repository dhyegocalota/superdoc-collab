import { BYTES_PER_MEGABYTE } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { bootstrapHostEnvironment } from './bootstrap-host-environment';

const SOURCE = {
  PATH: '/usr/bin',
  HOME: '/home/superdoc',
  AUTH_SECRET: 'change-me-32-characters-minimum-secret',
  OPENROUTER_API_KEY: 'sk-or-v1-key',
  DEMO_PASSWORD: 'superdoc-demo',
  DATABASE_DIR: './data',
  GITHUB_TOKEN: 'ghp_token',
  NODE_OPTIONS: '--no-warnings',
};

test('the secrets and the database location are blanked and everything the host needs is left to the process', () => {
  const environment = bootstrapHostEnvironment({ source: SOURCE, heapMegabytes: null });
  expect(environment).toMatchObject({
    AUTH_SECRET: undefined,
    OPENROUTER_API_KEY: undefined,
    DEMO_PASSWORD: undefined,
    DATABASE_DIR: undefined,
    GITHUB_TOKEN: undefined,
  });
  expect(Object.keys(environment)).not.toContain('PATH');
  expect(Object.keys(environment)).not.toContain('HOME');
});

test('every blanked name is present as a key so it overrides the inherited value', () => {
  const environment = bootstrapHostEnvironment({ source: SOURCE, heapMegabytes: null });
  expect(Object.keys(environment)).toEqual(expect.arrayContaining(['AUTH_SECRET', 'OPENROUTER_API_KEY', 'DEMO_PASSWORD', 'GITHUB_TOKEN']));
});

test('a heap size sets the memory the Bun runtime of the host sizes its collector for, in bytes', () => {
  expect(bootstrapHostEnvironment({ source: SOURCE, heapMegabytes: 1536 }).BUN_JSC_forceRAMSize).toBe(String(1536 * BYTES_PER_MEGABYTE));
});

test('node options mean nothing to the host, so a heap size never touches them', () => {
  expect(Object.keys(bootstrapHostEnvironment({ source: SOURCE, heapMegabytes: 1536 }))).not.toContain('NODE_OPTIONS');
});

test('no heap size sets no memory for the host', () => {
  expect(Object.keys(bootstrapHostEnvironment({ source: SOURCE, heapMegabytes: null }))).not.toContain('BUN_JSC_forceRAMSize');
});
