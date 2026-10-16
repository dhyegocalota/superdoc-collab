import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/seed.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  external: ['better-sqlite3'],
  noExternal: ['@superdoc-history/types'],
});
