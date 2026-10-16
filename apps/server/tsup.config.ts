import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts', seed: 'src/seed.ts', 'projection-worker': 'src/history/projection-worker.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  external: ['better-sqlite3', '@superdoc/sdk'],
  noExternal: ['@superdoc-history/types', '@superdoc-history/history'],
});
