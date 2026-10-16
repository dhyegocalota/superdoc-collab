import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/read-model.ts',
  out: './drizzle/read-model',
});
