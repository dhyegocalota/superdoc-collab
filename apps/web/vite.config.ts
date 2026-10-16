import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const SERVER_ORIGIN = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '/api': SERVER_ORIGIN,
      '/collaboration': { target: SERVER_ORIGIN, ws: true },
    },
  },
  build: { outDir: 'dist', target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
