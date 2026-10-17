import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: { target: 'esnext', outDir: '../dist-client', emptyOutDir: true },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  server: { port: 5198, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5198, strictPort: true, host: '127.0.0.1' },
});
